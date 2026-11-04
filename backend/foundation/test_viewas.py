"""
"View as role": the gate is that what an Owner sees as a role is byte for byte what a member of that
role is sent, for every role and every model; and that it can't change anything, or be used by anyone
who isn't an Owner or Manager.
"""
from django.apps import apps
from django.contrib.auth.models import Group
from django.test import TestCase

from core.models import Contact
from foundation.models import AuditEntry
from foundation.test_roles import member_of
from foundation.viewas import HEADER, viewable_roles
from schema.engine import is_exposed

HEADER_NAME = HEADER.removeprefix('HTTP_').replace('_', '-').title()


def viewing(client, role):
    """Headers as the browser sends them (Django's test client wants the META spelling)."""
    return {HEADER: role}


class ViewAsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner, cls.owner_client = member_of('Owner', 'owner')
        cls.manager, cls.manager_client = member_of('Manager', 'manager')
        cls.members = {}
        for role in viewable_roles():
            cls.members[role] = member_of(role, 'member-' + role.lower().replace(' ', '-'))
        Contact.objects.create(name='Indus Textile Mills (demo)', type='company', is_customer=True)

    def models(self):
        return [m for m in apps.get_models() if is_exposed(m)]

    def test_the_schema_a_role_gets_is_what_view_as_shows_for_every_role_and_model(self):
        checked = 0
        for role in viewable_roles():
            self.client_for(role)
            self.owner_client.post('/api/view-as/start/', {'role': role}, format='json')
            _, member_client = self.members[role]
            for model in self.models():
                url = f'/api/schema/{model._meta.app_label}/{model._meta.model_name}/'
                real = member_client.get(url)
                seen = self.owner_client.get(url, **viewing(self.owner_client, role))
                self.assertEqual(seen.status_code, real.status_code, (role, url))
                self.assertEqual(seen.content, real.content, (role, url))
                checked += 1
        self.assertGreater(checked, 100)

    def client_for(self, role):
        return self.members[role][1]

    def test_the_registry_and_a_list_are_the_roles_too(self):
        for role in viewable_roles():
            self.owner_client.post('/api/view-as/start/', {'role': role}, format='json')
            member = self.members[role][1]
            for url in ('/api/registry/', '/api/data/core/contact/'):
                seen = self.owner_client.get(url, **viewing(self.owner_client, role))
                real = member.get(url)
                self.assertEqual(seen.status_code, real.status_code, (role, url))
                self.assertEqual(seen.content, real.content, (role, url))

    def test_a_field_agent_cannot_use_it_at_all(self):
        agent = self.members['Field agent'][1]
        self.assertEqual(agent.get('/api/view-as/roles/').status_code, 403)
        self.assertEqual(agent.post('/api/view-as/start/', {'role': 'Accounts'}, format='json').status_code, 403)
        self.assertEqual(agent.get('/api/registry/', **viewing(agent, 'Owner')).status_code, 403)
        self.assertEqual(agent.get('/api/data/core/contact/', **viewing(agent, 'Owner')).status_code, 403)

    def test_only_owner_and_manager_hold_the_permission(self):
        for role, (user, _) in self.members.items():
            self.assertEqual(user.has_perm('core.view_as_role'), role in ('Owner', 'Manager'), role)

    def test_nothing_can_be_changed_while_viewing_as_a_role(self):
        self.owner_client.post('/api/view-as/start/', {'role': 'Field agent'}, format='json')
        header = viewing(self.owner_client, 'Field agent')
        before = Contact.objects.count()
        attempts = [
            self.owner_client.post('/api/data/core/contact/', {'name': 'X (demo)'}, format='json', **header),
            self.owner_client.patch(f'/api/data/core/contact/{Contact.objects.first().pk}/', {'city': 'Karachi'}, format='json', **header),
            self.owner_client.delete(f'/api/data/core/contact/{Contact.objects.first().pk}/', **header),
        ]
        for response in attempts:
            self.assertEqual(response.status_code, 403, response.content)
            self.assertIn('Nothing here can be changed', response.json()['detail'])
        self.assertEqual(Contact.objects.count(), before)
        self.assertEqual(Contact.objects.first().city, '')

    def test_starting_is_audited_and_names_the_role(self):
        before = AuditEntry.objects.filter(action='view_as').count()
        self.owner_client.post('/api/view-as/start/', {'role': 'Accounts'}, format='json')
        entries = AuditEntry.objects.filter(action='view_as')
        self.assertEqual(entries.count(), before + 1)
        entry = entries.first()
        self.assertEqual(entry.actor, self.owner)
        self.assertIn('Accounts', entry.summary)

    def test_an_unknown_role_is_a_404_and_reading_leaves_no_trace_in_recents(self):
        self.assertEqual(self.owner_client.post('/api/view-as/start/', {'role': 'Pirate'}, format='json').status_code, 404)
        self.owner_client.post('/api/view-as/start/', {'role': 'Coordinator'}, format='json')
        contact = Contact.objects.first()
        from userstate.models import RecordView

        before = RecordView.objects.count()
        response = self.owner_client.get(f'/api/data/core/contact/{contact.pk}/', **viewing(self.owner_client, 'Coordinator'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(RecordView.objects.count(), before)

    def test_a_role_with_no_members_is_still_viewable_and_the_account_cannot_sign_in(self):
        Group.objects.get_or_create(name='Cashier')
        for user, _ in self.members.values():
            pass
        self.members['Cashier'][0].delete()
        response = self.owner_client.post('/api/view-as/start/', {'role': 'Cashier'}, format='json')
        self.assertEqual(response.status_code, 200)
        from django.contrib.auth import get_user_model

        synthetic = get_user_model().objects.get(username='view-as-cashier')
        self.assertFalse(synthetic.has_usable_password())
        self.assertEqual(self.owner_client.get('/api/registry/', **viewing(self.owner_client, 'Cashier')).status_code, 200)
