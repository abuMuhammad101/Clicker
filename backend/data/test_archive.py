"""
Archiving: an edit of the model's declared `archive_field`, allowed exactly
when the user may write that field. Archived records leave lists and pickers
unless asked for, and stay reachable by id.
"""
from django.test import TestCase

from core.models import Contact, Country
from foundation.models import AuditEntry
from foundation.roles import CLERK, MANAGER
from foundation.test_roles import member_of
from schema.engine import build_schema

CONTACTS = '/api/data/core/contact/'


class ArchiveTests(TestCase):
    def setUp(self):
        country = Country.objects.create(name='Pakistan', code='PK')
        self.kept = Contact.objects.create(name='Indus Traders', type='company', country=country)
        self.archived = Contact.objects.create(name='Old Mill Supplies', type='company', active=False)
        self.clerk, self.clerk_client = member_of(CLERK, 'clerk')
        self.manager, self.manager_client = member_of(MANAGER, 'manager')

    def names(self, response):
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        rows = body['results'] if isinstance(body, dict) else body
        return [row.get('display') or row.get('label') for row in rows]

    def test_schema_offers_archive_only_to_who_may_write_the_field(self):
        self.assertEqual(build_schema(Contact, self.manager)['archive_field'], 'active')
        self.assertTrue(build_schema(Contact, self.manager)['actions']['archive'])
        self.assertFalse(build_schema(Contact, self.clerk)['actions']['archive'])

    def test_the_list_leaves_archived_records_out(self):
        self.assertEqual(self.names(self.manager_client.get(CONTACTS)), ['Indus Traders'])

    def test_the_list_shows_archived_records_when_asked(self):
        self.assertEqual(self.names(self.manager_client.get(f'{CONTACTS}?active=false')), ['Old Mill Supplies'])

    def test_pickers_leave_archived_records_out_but_resolve_one_by_id(self):
        self.assertEqual(self.names(self.manager_client.get(f'{CONTACTS}search/?q=s')), ['Indus Traders'])
        by_id = self.manager_client.get(f'{CONTACTS}search/?id={self.archived.pk}')
        self.assertEqual(self.names(by_id), ['Old Mill Supplies'])

    def test_an_archived_record_is_still_reachable_by_id(self):
        self.assertEqual(self.manager_client.get(f'{CONTACTS}{self.archived.pk}/').status_code, 200)

    def test_manager_archives_and_restores_and_both_are_audited(self):
        url = f'{CONTACTS}{self.kept.pk}/'
        self.assertEqual(self.manager_client.patch(url, {'active': False}, format='json').status_code, 200)
        self.assertEqual(self.manager_client.patch(url, {'active': True}, format='json').status_code, 200)
        changes = [
            entry.changes['active']
            for entry in AuditEntry.objects.filter(record_id=str(self.kept.pk), action=AuditEntry.ACTION_UPDATE)
            .order_by('timestamp', 'id')
        ]
        self.assertEqual(changes, [{'before': True, 'after': False}, {'before': False, 'after': True}])

    def test_clerk_cannot_archive(self):
        response = self.clerk_client.patch(f'{CONTACTS}{self.kept.pk}/', {'active': False}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('active', response.json())
        self.kept.refresh_from_db()
        self.assertTrue(self.kept.active)
