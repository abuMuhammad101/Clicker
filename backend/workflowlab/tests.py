"""
The S-3 gate, on the throwaway LabDocument:

- a transition the user lacks is refused by the API and absent from their schema;
- two concurrent creates never get the same number;
- a requester approving their own reduction is refused.

Plus the rules around them: wrong-state transitions are a conflict (409),
locked states refuse edits, the state is never client-writable, and every
transition is audited with its before and after.
"""
import threading

from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from foundation.models import AuditEntry
from foundation.roles import CLERK, MANAGER
from foundation.test_roles import member_of
from schema.engine import build_schema

from .models import LabDocument

URL = '/api/data/workflowlab/labdocument/'


def transition_url(doc, name):
    return f'{URL}{doc.pk}/transitions/{name}/'


def audit_for(doc):
    return AuditEntry.objects.filter(
        content_type=ContentType.objects.get_for_model(LabDocument), record_id=str(doc.pk)
    ).order_by('timestamp', 'id')


class WorkflowTests(TestCase):
    def setUp(self):
        self.clerk, self.clerk_client = member_of(CLERK, 'clerk')
        self.manager, self.manager_client = member_of(MANAGER, 'manager')
        self.other_manager, self.other_manager_client = member_of(MANAGER, 'manager-2')

    def create(self, client, **values):
        response = client.post(URL, {'title': 'Credit note for damaged stock', 'amount': '9500.00', **values}, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        return LabDocument.objects.get(pk=response.json()['id'])

    def run_as(self, client, doc, name):
        return client.post(transition_url(doc, name), format='json')

    # --- The schema -----------------------------------------------------------

    def test_schema_lists_only_the_transitions_the_user_holds(self):
        clerk = [t['name'] for t in build_schema(LabDocument, self.clerk)['workflow']['transitions']]
        manager = [t['name'] for t in build_schema(LabDocument, self.manager)['workflow']['transitions']]
        self.assertEqual(clerk, ['post', 'request'])
        self.assertEqual(manager, ['post', 'cancel', 'request', 'approve', 'reject'])

    def test_schema_carries_the_states_and_the_locked_ones(self):
        workflow = build_schema(LabDocument, self.clerk)['workflow']
        self.assertEqual(workflow['field'], 'state')
        self.assertEqual(workflow['states'][0], {'value': 'draft', 'label': 'Draft'})
        self.assertIn('posted', workflow['locked'])
        self.assertNotIn('draft', workflow['locked'])

    def test_models_without_a_workflow_say_so(self):
        from core.models import Contact

        self.assertIsNone(build_schema(Contact, self.clerk)['workflow'])

    def test_record_envelope_lists_what_this_user_can_do_now(self):
        doc = self.create(self.clerk_client)
        clerk_view = self.clerk_client.get(f'{URL}{doc.pk}/').json()['workflow']
        manager_view = self.manager_client.get(f'{URL}{doc.pk}/').json()['workflow']
        self.assertEqual(clerk_view, {'available': ['post', 'request'], 'locked': False})
        self.assertEqual(manager_view['available'], ['post', 'cancel', 'request'])

    # --- Gate 1: a transition the user lacks ----------------------------------

    def test_clerk_cannot_cancel(self):
        doc = self.create(self.clerk_client)
        response = self.run_as(self.clerk_client, doc, 'cancel')
        self.assertEqual(response.status_code, 403)
        doc.refresh_from_db()
        self.assertEqual(doc.state, LabDocument.DRAFT)

    def test_clerk_cannot_approve_even_someone_elses_request(self):
        doc = self.create(self.manager_client)
        self.assertEqual(self.run_as(self.manager_client, doc, 'request').status_code, 200)
        self.assertEqual(self.run_as(self.clerk_client, doc, 'approve').status_code, 403)

    def test_an_unknown_transition_is_not_found(self):
        doc = self.create(self.clerk_client)
        self.assertEqual(self.run_as(self.manager_client, doc, 'delete').status_code, 404)

    def test_a_record_the_user_cannot_see_is_not_found(self):
        from foundation.testing import make_user
        from rest_framework.test import APIClient

        doc = self.create(self.clerk_client)
        stranger = make_user('stranger')
        client = APIClient()
        client.force_login(stranger)
        self.assertEqual(self.run_as(client, doc, 'post').status_code, 404)

    # --- Moving state ---------------------------------------------------------

    def test_clerk_posts_a_draft_and_it_is_audited(self):
        doc = self.create(self.clerk_client)
        response = self.run_as(self.clerk_client, doc, 'post')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['values']['state'], 'posted')
        self.assertEqual(response.json()['workflow'], {'available': [], 'locked': True})

        entry = audit_for(doc).last()
        self.assertEqual(entry.action, AuditEntry.ACTION_TRANSITION)
        self.assertEqual(entry.actor, self.clerk)
        self.assertEqual(entry.changes['state'], {'before': 'draft', 'after': 'posted'})

    def test_a_transition_from_the_wrong_state_is_a_conflict(self):
        doc = self.create(self.clerk_client)
        self.run_as(self.clerk_client, doc, 'post')
        response = self.run_as(self.manager_client, doc, 'cancel')
        self.assertEqual(response.status_code, 409)
        self.assertIn('Posted', response.json()['detail'])

    def test_the_state_is_never_client_writable(self):
        refused = self.manager_client.post(URL, {'title': 'Sneaky', 'state': 'posted'}, format='json')
        self.assertEqual(refused.status_code, 400)
        self.assertIn('state', refused.json())

        doc = self.create(self.clerk_client)
        response = self.manager_client.patch(f'{URL}{doc.pk}/', {'state': 'approved'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('state', response.json())
        doc.refresh_from_db()
        self.assertEqual(doc.state, LabDocument.DRAFT)

    def test_state_and_number_are_read_only_in_the_schema(self):
        fields = build_schema(LabDocument, self.manager)['fields']
        self.assertTrue(fields['state']['read_only'])
        self.assertTrue(fields['state']['read_only_on_create'])
        self.assertTrue(fields['number']['read_only'])
        self.assertNotIn('requested_by', fields)

    def test_a_locked_record_refuses_edits(self):
        doc = self.create(self.clerk_client)
        self.run_as(self.clerk_client, doc, 'post')
        response = self.manager_client.patch(f'{URL}{doc.pk}/', {'title': 'Changed after posting'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertIn('can’t be edited', response.json()['detail'])
        doc.refresh_from_db()
        self.assertEqual(doc.title, 'Credit note for damaged stock')

    def test_a_draft_can_still_be_edited(self):
        doc = self.create(self.clerk_client)
        response = self.clerk_client.patch(f'{URL}{doc.pk}/', {'title': 'Credit note, corrected'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)

    # --- Gate 3: the requester can't approve their own reduction --------------

    def test_requester_cannot_approve_their_own_request(self):
        doc = self.create(self.manager_client)
        self.assertEqual(self.run_as(self.manager_client, doc, 'request').status_code, 200)
        doc.refresh_from_db()
        self.assertEqual(doc.requested_by, self.manager)

        response = self.run_as(self.manager_client, doc, 'approve')
        self.assertEqual(response.status_code, 403)
        self.assertIn('someone else', response.json()['detail'])
        self.assertEqual(self.run_as(self.manager_client, doc, 'reject').status_code, 403)
        doc.refresh_from_db()
        self.assertEqual(doc.state, LabDocument.REQUESTED)

    def test_requester_does_not_see_approve_as_available(self):
        doc = self.create(self.manager_client)
        self.run_as(self.manager_client, doc, 'request')
        own = self.manager_client.get(f'{URL}{doc.pk}/').json()['workflow']['available']
        other = self.other_manager_client.get(f'{URL}{doc.pk}/').json()['workflow']['available']
        self.assertEqual(own, [])
        self.assertEqual(other, ['approve', 'reject'])

    def test_another_manager_approves_and_it_is_audited(self):
        doc = self.create(self.clerk_client)
        self.assertEqual(self.run_as(self.clerk_client, doc, 'request').status_code, 200)
        response = self.run_as(self.other_manager_client, doc, 'approve')
        self.assertEqual(response.status_code, 200, response.content)
        doc.refresh_from_db()
        self.assertEqual(doc.state, LabDocument.APPROVED)
        self.assertEqual(doc.requested_by, self.clerk)

        entries = list(audit_for(doc))
        self.assertEqual([e.action for e in entries][-2:], [AuditEntry.ACTION_TRANSITION] * 2)
        self.assertEqual(entries[-1].actor, self.other_manager)
        self.assertEqual(entries[-1].changes['state'], {'before': 'requested', 'after': 'approved'})

    # --- Numbering ------------------------------------------------------------

    def test_creates_are_numbered_in_sequence(self):
        year = timezone.localdate().year
        first = self.create(self.clerk_client)
        second = self.create(self.clerk_client)
        self.assertEqual(first.number, f'LAB-{year}-00001')
        self.assertEqual(second.number, f'LAB-{year}-00002')

    def test_the_number_is_never_client_writable(self):
        response = self.manager_client.post(URL, {'title': 'Backdated', 'number': 'LAB-1999-99999'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('number', response.json())
        self.assertFalse(LabDocument.objects.filter(number='LAB-1999-99999').exists())

    def test_a_refused_create_does_not_use_up_a_number(self):
        year = timezone.localdate().year
        self.manager_client.post(URL, {'amount': '1.00'}, format='json')  # no title: refused
        self.assertEqual(self.create(self.clerk_client).number, f'LAB-{year}-00001')


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
                    response = client.post(URL, {'title': f'Concurrent {n}', 'amount': '100.00'}, format='json')
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
        numbers = list(LabDocument.objects.values_list('number', flat=True))
        self.assertEqual(len(numbers), self.THREADS * self.EACH)
        self.assertEqual(len(set(numbers)), len(numbers), 'two creates got the same number')
        year = timezone.localdate().year
        self.assertEqual(sorted(numbers), [f'LAB-{year}-{i:05d}' for i in range(1, len(numbers) + 1)])
