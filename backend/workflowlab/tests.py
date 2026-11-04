"""
The S-3 gate, on the lab bill and lab adjustment:

- a transition the user lacks is refused by the API and absent from their schema;
- two concurrent creates never get the same number;
- a requester approving their own reduction is refused.

Plus the rules around them: wrong-state transitions are a conflict (409),
locked states refuse edits, the state and number are never client-writable,
every transition is audited, and the record says who it's waiting for.
"""
import threading

from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from foundation.models import AuditEntry
from foundation.roles import CLERK, MANAGER
from foundation.test_roles import member_of
from foundation.testing import make_user
from schema.engine import build_schema

from .models import LabAdjustment, LabBill

BILLS = '/api/data/workflowlab/labbill/'
ADJUSTMENTS = '/api/data/workflowlab/labadjustment/'


def audit_for(obj):
    return AuditEntry.objects.filter(
        content_type=ContentType.objects.get_for_model(type(obj)), record_id=str(obj.pk)
    ).order_by('timestamp', 'id')


class LabTestCase(TestCase):
    def setUp(self):
        self.clerk, self.clerk_client = member_of(CLERK, 'clerk')
        self.manager, self.manager_client = member_of(MANAGER, 'manager')
        self.other_manager, self.other_manager_client = member_of(MANAGER, 'manager-2')

    def create_bill(self, client, **values):
        response = client.post(BILLS, {'customer': 'Indus Traders', 'amount': '9500.00', **values}, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        return LabBill.objects.get(pk=response.json()['id'])

    def create_adjustment(self, client, **values):
        body = {'reason': 'Damaged stock returned', 'amount': '2400.00', **values}
        response = client.post(ADJUSTMENTS, body, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        return LabAdjustment.objects.get(pk=response.json()['id'])

    def run_as(self, client, obj, name):
        base = BILLS if isinstance(obj, LabBill) else ADJUSTMENTS
        return client.post(f'{base}{obj.pk}/transitions/{name}/', format='json')

    def status_for(self, client, obj):
        base = BILLS if isinstance(obj, LabBill) else ADJUSTMENTS
        return client.get(f'{base}{obj.pk}/').json()['workflow']


class WorkflowSchemaTests(LabTestCase):
    def test_schema_lists_only_the_transitions_the_user_holds(self):
        def names(model, user):
            return [t['name'] for t in build_schema(model, user)['workflow']['transitions']]

        self.assertEqual(names(LabBill, self.clerk), ['post'])
        self.assertEqual(names(LabBill, self.manager), ['post', 'cancel'])
        self.assertEqual(names(LabAdjustment, self.clerk), ['request'])
        self.assertEqual(names(LabAdjustment, self.manager), ['request', 'approve', 'reject'])

    def test_schema_carries_states_path_tones_and_locks(self):
        workflow = build_schema(LabAdjustment, self.clerk)['workflow']
        self.assertEqual(workflow['field'], 'state')
        self.assertEqual(workflow['path'], ['draft', 'requested', 'approved'])
        self.assertEqual(workflow['states'][0], {'value': 'draft', 'label': 'Draft', 'tone': 'neutral'})
        rejected = next(s for s in workflow['states'] if s['value'] == 'rejected')
        self.assertEqual(rejected, {'value': 'rejected', 'label': 'Rejected', 'tone': 'danger', 'after': 'requested'})
        # A Clerk can't cancel a bill, but the stepper still knows where Cancelled sits.
        cancelled = next(s for s in build_schema(LabBill, self.clerk)['workflow']['states'] if s['value'] == 'cancelled')
        self.assertEqual(cancelled['after'], 'draft')
        self.assertIn('requested', workflow['locked'])
        self.assertNotIn('draft', workflow['locked'])

    def test_requesting_says_who_it_goes_to_before_it_is_sent(self):
        request = build_schema(LabAdjustment, self.clerk)['workflow']['transitions'][0]
        self.assertEqual(request['hint'], 'This goes to a Manager or Owner for approval.')

    def test_a_declared_hint_and_confirm_reach_the_schema(self):
        post, cancel = build_schema(LabBill, self.manager)['workflow']['transitions']
        self.assertEqual(post['hint'], 'Once posted, it can’t be edited, only reversed.')
        self.assertIn('keeps its number', cancel['confirm'])

    def test_models_without_a_workflow_say_so(self):
        from core.models import Contact

        self.assertIsNone(build_schema(Contact, self.clerk)['workflow'])

    def test_state_and_number_are_read_only_and_the_number_says_when_it_arrives(self):
        fields = build_schema(LabAdjustment, self.manager)['fields']
        self.assertTrue(fields['state']['read_only'])
        self.assertTrue(fields['state']['read_only_on_create'])
        self.assertTrue(fields['number']['read_only'])
        self.assertEqual(fields['number']['assigned'], 'Assigned when saved')
        self.assertNotIn('requested_by', fields)


class WorkflowApiTests(LabTestCase):
    # --- Gate 1: a transition the user lacks ----------------------------------

    def test_clerk_cannot_cancel_a_bill(self):
        bill = self.create_bill(self.clerk_client)
        self.assertEqual(self.run_as(self.clerk_client, bill, 'cancel').status_code, 403)
        bill.refresh_from_db()
        self.assertEqual(bill.state, 'draft')

    def test_clerk_cannot_approve_even_someone_elses_request(self):
        adjustment = self.create_adjustment(self.manager_client)
        self.assertEqual(self.run_as(self.manager_client, adjustment, 'request').status_code, 200)
        self.assertEqual(self.run_as(self.clerk_client, adjustment, 'approve').status_code, 403)

    def test_an_unknown_transition_is_not_found(self):
        bill = self.create_bill(self.clerk_client)
        self.assertEqual(self.run_as(self.manager_client, bill, 'delete').status_code, 404)

    def test_a_record_the_user_cannot_see_is_not_found(self):
        bill = self.create_bill(self.clerk_client)
        client = APIClient()
        client.force_login(make_user('stranger'))
        self.assertEqual(self.run_as(client, bill, 'post').status_code, 404)

    # --- Moving state ---------------------------------------------------------

    def test_clerk_posts_a_draft_and_it_is_audited(self):
        bill = self.create_bill(self.clerk_client)
        response = self.run_as(self.clerk_client, bill, 'post')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['values']['state'], 'posted')
        self.assertEqual(response.json()['workflow']['available'], [])

        entry = audit_for(bill).last()
        self.assertEqual(entry.action, AuditEntry.ACTION_TRANSITION)
        self.assertEqual(entry.actor, self.clerk)
        self.assertEqual(entry.changes['state'], {'before': 'draft', 'after': 'posted'})

    def test_a_transition_from_the_wrong_state_is_a_conflict(self):
        bill = self.create_bill(self.clerk_client)
        self.run_as(self.clerk_client, bill, 'post')
        response = self.run_as(self.manager_client, bill, 'cancel')
        self.assertEqual(response.status_code, 409)
        self.assertIn('Posted', response.json()['detail'])

    def test_the_state_is_never_client_writable(self):
        refused = self.manager_client.post(BILLS, {'customer': 'Sneaky', 'state': 'posted'}, format='json')
        self.assertEqual(refused.status_code, 400)
        self.assertIn('state', refused.json())

        bill = self.create_bill(self.clerk_client)
        response = self.manager_client.patch(f'{BILLS}{bill.pk}/', {'state': 'posted'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('state', response.json())
        bill.refresh_from_db()
        self.assertEqual(bill.state, 'draft')

    def test_a_locked_record_refuses_edits_and_says_why(self):
        bill = self.create_bill(self.clerk_client)
        self.run_as(self.clerk_client, bill, 'post')
        response = self.manager_client.patch(f'{BILLS}{bill.pk}/', {'customer': 'Changed after posting'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertIn('can’t be edited', response.json()['detail'])
        bill.refresh_from_db()
        self.assertEqual(bill.customer, 'Indus Traders')

        status = self.status_for(self.manager_client, bill)
        self.assertTrue(status['locked'])
        self.assertEqual(status['locked_reason'], 'This lab bill is Posted, so it can’t be edited.')

    def test_a_draft_can_still_be_edited(self):
        bill = self.create_bill(self.clerk_client)
        response = self.clerk_client.patch(f'{BILLS}{bill.pk}/', {'customer': 'Indus Traders (Pvt) Ltd'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)

    # --- What the header says -------------------------------------------------

    def test_record_status_lists_what_this_user_can_do_now(self):
        bill = self.create_bill(self.clerk_client)
        self.assertEqual(
            self.status_for(self.clerk_client, bill),
            {'available': ['post'], 'locked': False, 'locked_reason': None, 'waiting': None, 'held_back': [], 'confirms': {}},
        )
        self.assertEqual(self.status_for(self.manager_client, bill)['available'], ['post', 'cancel'])

    def test_a_clerk_is_told_who_the_request_waits_for(self):
        adjustment = self.create_adjustment(self.clerk_client)
        self.run_as(self.clerk_client, adjustment, 'request')
        status = self.status_for(self.clerk_client, adjustment)
        self.assertEqual(status['available'], [])
        self.assertEqual(status['waiting'], 'Waiting for a Manager or Owner to approve or reject it.')

    def test_the_requester_is_told_someone_else_has_to_approve(self):
        adjustment = self.create_adjustment(self.manager_client)
        self.run_as(self.manager_client, adjustment, 'request')
        status = self.status_for(self.manager_client, adjustment)
        self.assertEqual(status['available'], [])
        self.assertEqual(status['waiting'], 'You’re its requester, so another Manager or Owner has to approve or reject it.')
        self.assertEqual(self.status_for(self.other_manager_client, adjustment)['available'], ['approve', 'reject'])

    def test_a_finished_record_waits_for_nobody(self):
        bill = self.create_bill(self.clerk_client)
        self.run_as(self.clerk_client, bill, 'post')
        self.assertIsNone(self.status_for(self.clerk_client, bill)['waiting'])

    # --- Gate 3: the requester can't approve their own reduction --------------

    def test_requester_cannot_approve_their_own_request(self):
        adjustment = self.create_adjustment(self.manager_client)
        self.assertEqual(self.run_as(self.manager_client, adjustment, 'request').status_code, 200)
        adjustment.refresh_from_db()
        self.assertEqual(adjustment.requested_by, self.manager)

        response = self.run_as(self.manager_client, adjustment, 'approve')
        self.assertEqual(response.status_code, 403)
        self.assertIn('someone else', response.json()['detail'])
        self.assertEqual(self.run_as(self.manager_client, adjustment, 'reject').status_code, 403)
        adjustment.refresh_from_db()
        self.assertEqual(adjustment.state, 'requested')

    def test_another_manager_approves_and_it_is_audited(self):
        adjustment = self.create_adjustment(self.clerk_client)
        self.assertEqual(self.run_as(self.clerk_client, adjustment, 'request').status_code, 200)
        response = self.run_as(self.other_manager_client, adjustment, 'approve')
        self.assertEqual(response.status_code, 200, response.content)
        adjustment.refresh_from_db()
        self.assertEqual(adjustment.state, 'approved')
        self.assertEqual(adjustment.requested_by, self.clerk)

        entries = list(audit_for(adjustment))
        self.assertEqual([e.action for e in entries][-2:], [AuditEntry.ACTION_TRANSITION] * 2)
        self.assertEqual(entries[-1].actor, self.other_manager)
        self.assertEqual(entries[-1].changes['state'], {'before': 'requested', 'after': 'approved'})

    # --- Numbering ------------------------------------------------------------

    def test_creates_are_numbered_in_sequence_per_model(self):
        year = timezone.localdate().year
        self.assertEqual(self.create_bill(self.clerk_client).number, f'BILL-{year}-00001')
        self.assertEqual(self.create_bill(self.clerk_client).number, f'BILL-{year}-00002')
        self.assertEqual(self.create_adjustment(self.clerk_client).number, f'ADJ-{year}-00001')

    def test_the_number_is_never_client_writable(self):
        response = self.manager_client.post(BILLS, {'customer': 'Backdated', 'number': 'BILL-1999-99999'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('number', response.json())
        self.assertFalse(LabBill.objects.filter(number='BILL-1999-99999').exists())

    def test_a_refused_create_does_not_use_up_a_number(self):
        year = timezone.localdate().year
        self.manager_client.post(BILLS, {'amount': '1.00'}, format='json')  # no customer: refused
        self.assertEqual(self.create_bill(self.clerk_client).number, f'BILL-{year}-00001')


class ConcurrentNumberingTests(TransactionTestCase):
    """
    Gate 2. Real threads, each with its own database connection and its own
    transaction, released together so their creates overlap.
    """

    THREADS = 8
    EACH = 3

    def test_concurrent_creates_never_share_a_number(self):
        users = [member_of(CLERK, f'clerk-{i}') for i in range(self.THREADS)]
        start = threading.Barrier(self.THREADS)
        statuses, errors = [], []

        def work(client):
            try:
                start.wait()
                for n in range(self.EACH):
                    response = client.post(BILLS, {'customer': f'Concurrent {n}', 'amount': '100.00'}, format='json')
                    statuses.append(response.status_code)
            except Exception as error:  # surfaced below; a thread can't fail the test itself
                errors.append(error)
            finally:
                connection.close()

        threads = [threading.Thread(target=work, args=(client,)) for _, client in users]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(errors, [])
        self.assertEqual(statuses, [201] * (self.THREADS * self.EACH))
        numbers = list(LabBill.objects.values_list('number', flat=True))
        self.assertEqual(len(numbers), self.THREADS * self.EACH)
        self.assertEqual(len(set(numbers)), len(numbers), 'two creates got the same number')
        year = timezone.localdate().year
        self.assertEqual(sorted(numbers), [f'BILL-{year}-{i:05d}' for i in range(1, len(numbers) + 1)])
