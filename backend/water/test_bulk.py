"""Assigning an owner to several recovery cases at once: permission, scope, domain, atomicity, trail."""
from django.test import TestCase

from billing.testing import BillingWorld
from foundation.models import AuditEntry
from foundation.test_roles import member_of

from .models import RecoveryCase

BULK = '/api/data/water/recoverycase/bulk/assign_owner/'


class AssignOwnerTests(BillingWorld, TestCase):
    def setUp(self):
        self.build_world()
        self.cases = []
        for index in range(3):
            consumer = self.customer(f'Consumer {index} (demo)')
            self.cases.append(RecoveryCase.objects.create(consumer=consumer))
        self.officer_staff = self.staff['recovery']

    def assign(self, client, ids, value):
        return client.post(BULK, {'ids': ids, 'value': value}, format='json')

    def test_a_manager_assigns_several_cases_in_one_go_and_each_is_audited(self):
        ids = [case.pk for case in self.cases]
        before = AuditEntry.objects.count()
        response = self.assign(self.manager_client, ids, self.officer_staff.pk)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['updated'], 3)
        self.assertEqual(set(RecoveryCase.objects.values_list('owner_id', flat=True)), {self.officer_staff.pk})
        self.assertEqual(AuditEntry.objects.count() - before, 3)

    def test_assigned_cases_appear_in_that_officers_list_and_leave_needs_an_owner(self):
        needs = '/api/data/water/recoverycase/?filter=owner:empty'
        self.assertEqual(self.manager_client.get(needs).json()['count'], 3)
        self.assertEqual(self.recovery_client.get('/api/data/water/recoverycase/').json()['count'], 0)
        self.assign(self.manager_client, [self.cases[0].pk, self.cases[1].pk], self.officer_staff.pk)
        self.assertEqual(self.manager_client.get(needs).json()['count'], 1)
        mine = self.recovery_client.get('/api/data/water/recoverycase/').json()
        self.assertEqual(mine['count'], 2)

    def test_a_user_without_the_permission_gets_403_and_nothing_changes(self):
        ids = [case.pk for case in self.cases]
        for client in (self.officer_client, self.cashier_client):
            self.assertIn(self.assign(client, ids, self.officer_staff.pk).status_code, (403, 404))
        # A Recovery officer sees their own cases but may not hand them out: the owner is a restricted field.
        self.assign(self.manager_client, [self.cases[0].pk], self.officer_staff.pk)
        denied = self.assign(self.recovery_client, [self.cases[0].pk], self.staff['recovery2'].pk)
        self.assertEqual(denied.status_code, 403)
        self.cases[0].refresh_from_db()
        self.assertEqual(self.cases[0].owner_id, self.officer_staff.pk)
        self.assertEqual(self.assign(self.auditor_client, ids, self.officer_staff.pk).status_code, 403)

    def test_the_action_is_not_offered_to_someone_who_cannot_do_it(self):
        offered = lambda client: client.get('/api/schema/water/recoverycase/').json()['list']['bulk_actions']
        self.assertEqual([a['key'] for a in offered(self.manager_client)], ['assign_owner'])
        self.assertEqual(offered(self.recovery_client), [])
        self.assertEqual(offered(self.officer_client), [])

    def test_only_a_recovery_officer_can_be_chosen(self):
        ids = [self.cases[0].pk]
        not_an_officer = self.officer_client_staff()
        response = self.assign(self.manager_client, ids, not_an_officer.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn('value', response.json())
        self.assertIsNone(RecoveryCase.objects.get(pk=ids[0]).owner_id)

    def officer_client_staff(self):
        from core.models import Staff

        return Staff.objects.create(display_name='Bilal Ahmed', user=self.officer, role='Billing officer')

    def test_a_case_the_user_cannot_see_makes_the_whole_request_a_404(self):
        self.assign(self.manager_client, [self.cases[0].pk], self.staff['recovery2'].pk)
        # One id that doesn't exist (or isn't visible to this user) refuses the lot, and changes nothing.
        response = self.assign(self.manager_client, [self.cases[0].pk, 99999], self.officer_staff.pk)
        self.assertEqual(response.status_code, 404)
        self.cases[0].refresh_from_db()
        self.assertEqual(self.cases[0].owner_id, self.staff['recovery2'].pk)

    def test_a_closed_case_refuses_the_whole_batch(self):
        RecoveryCase.objects.filter(pk=self.cases[2].pk).update(state='settled')
        response = self.assign(self.manager_client, [case.pk for case in self.cases], self.officer_staff.pk)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(RecoveryCase.objects.filter(owner__isnull=False).count(), 0)

    def test_validation_of_the_request(self):
        for body in ({'value': 1}, {'ids': [], 'value': 1}, {'ids': 'x', 'value': 1}, {'ids': [True], 'value': 1}):
            self.assertEqual(self.manager_client.post(BULK, body, format='json').status_code, 400, body)
        self.assertEqual(self.manager_client.post('/api/data/water/recoverycase/bulk/nope/', {'ids': [1]}, format='json').status_code, 404)
