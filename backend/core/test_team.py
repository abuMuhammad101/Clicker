"""The team page: role and active are edited, the account follows, and the guards hold."""
from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.models import Staff
from foundation.models import AuditEntry
from foundation.test_roles import member_of

TEAM = '/api/data/core/staff/'


def person(role, username, name):
    user, client = member_of(role, username)
    staff = Staff.objects.create(display_name=name, user=user, role=role)
    return user, client, staff


class TeamTests(TestCase):
    def setUp(self):
        self.manager, self.manager_client, self.manager_staff = person('Manager', 'ayesha', 'Ayesha Khan')
        self.officer, self.officer_client, self.officer_staff = person('Billing officer', 'bilal', 'Bilal Ahmed')

    def patch(self, client, staff, **values):
        return client.patch(f'{TEAM}{staff.pk}/', values, format='json')

    def groups(self, user):
        return set(user.groups.values_list('name', flat=True))

    def test_a_manager_changes_a_role_and_the_account_follows_and_it_is_audited(self):
        response = self.patch(self.manager_client, self.officer_staff, role='Cashier')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.groups(self.officer), {'Cashier'})
        entry = AuditEntry.objects.filter(record_id=str(self.officer_staff.pk), action='update').first()
        self.assertEqual(entry.actor, self.manager)
        self.assertEqual(entry.changes['role'], {'before': 'Billing officer', 'after': 'Cashier'})

    def test_a_billing_officer_cannot_change_anyones_role(self):
        response = self.patch(self.officer_client, self.manager_staff, role='Cashier')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.groups(self.manager), {'Manager'})

    def test_you_cannot_change_your_own_role_or_deactivate_yourself(self):
        other, _, _ = person('Manager', 'tariq', 'Tariq Mehmood')
        response = self.patch(self.manager_client, self.manager_staff, role='Cashier')
        self.assertEqual(response.status_code, 409)
        self.assertIn('own role', response.json()['detail'])
        self.assertEqual(self.groups(self.manager), {'Manager'})
        self.assertEqual(self.patch(self.manager_client, self.manager_staff, active=False).status_code, 409)
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.is_active)

    @override_settings(CLICKER_JOURNEY='water')  # the water board's top role is Manager alone
    def test_the_last_manager_cannot_be_demoted_or_deactivated(self):
        # Ayesha is the only Manager. A second person who may edit the team but is not a Manager
        # (an Owner, say) must still not be able to remove her.
        owner, owner_client, _ = person('Owner', 'hamza', 'Hamza Farooqui')
        self.assertEqual(self.patch(owner_client, self.manager_staff, role='Cashier').status_code, 409)
        self.assertEqual(self.patch(owner_client, self.manager_staff, active=False).status_code, 409)
        self.assertEqual(self.groups(self.manager), {'Manager'})
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.is_active)

    def test_a_manager_can_be_demoted_once_another_top_role_holder_exists(self):
        second, _, _ = person('Manager', 'tariq', 'Tariq Mehmood')
        owner, owner_client, _ = person('Owner', 'hamza', 'Hamza Farooqui')
        tariq = Staff.objects.get(user=second)
        self.assertEqual(self.patch(owner_client, tariq, role='Cashier').status_code, 200)
        self.assertEqual(self.groups(second), {'Cashier'})

    def test_a_deactivated_person_is_signed_out_and_cannot_sign_in(self):
        self.assertEqual(self.officer_client.get('/api/registry/').status_code, 200)
        self.assertEqual(self.patch(self.manager_client, self.officer_staff, active=False).status_code, 200)
        self.officer.refresh_from_db()
        self.assertFalse(self.officer.is_active)
        self.assertEqual(self.officer_client.get('/api/registry/').status_code, 401)
        self.officer.set_password('a-Real-passw0rd-here')
        self.officer.save()
        attempt = APIClient().post('/api/auth/login/', {'username': 'bilal', 'password': 'a-Real-passw0rd-here'}, format='json')
        self.assertIn(attempt.status_code, (400, 401, 403))
        left = [s for s in Session.objects.all() if s.get_decoded().get('_auth_user_id') == str(self.officer.pk)]
        self.assertEqual(left, [])

    def test_reactivating_lets_them_in_again(self):
        self.patch(self.manager_client, self.officer_staff, active=False)
        self.assertEqual(self.patch(self.manager_client, self.officer_staff, active=True).status_code, 200)
        self.officer.refresh_from_db()
        self.assertTrue(self.officer.is_active)

    def test_a_role_that_does_not_exist_here_is_refused(self):
        response = self.patch(self.manager_client, self.officer_staff, role='Wizard')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.groups(self.officer), {'Billing officer'})

    def test_the_list_shows_role_status_and_last_sign_in(self):
        schema = self.manager_client.get('/api/schema/core/staff/').json()
        self.assertEqual(schema['list']['columns'], ['display_name', 'role', 'active', 'last_sign_in'])
        self.assertEqual(schema['fields']['last_sign_in']['type'], 'datetime')
        self.assertEqual(schema['verbose_name_plural'], 'team')
