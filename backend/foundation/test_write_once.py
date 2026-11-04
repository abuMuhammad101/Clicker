"""
Write-once field access: set when a record is created, read-only after.
Contact.tax_id for the Clerk; a Manager keeps full write. Through the real
roles and the real API, with the audit trail checked for each accepted write.
"""
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from core.models import Contact, Country
from data.serializers import NOT_WRITABLE
from foundation.models import AuditEntry
from foundation.permissions import CREATE_ONLY, READ, WRITE, field_access
from foundation.roles import CLERK, MANAGER
from foundation.test_roles import member_of
from foundation.testing import make_user
from schema.engine import build_schema

NOTE = 'Set when the record is created. Ask a Manager or Owner to change it.'


def audit_for(contact):
    return AuditEntry.objects.filter(
        content_type=ContentType.objects.get_for_model(Contact), record_id=str(contact.pk)
    ).order_by('timestamp', 'id')


class WriteOnceTests(TestCase):
    def setUp(self):
        self.country = Country.objects.create(name='Pakistan', code='PK')
        self.clerk, self.clerk_client = member_of(CLERK, 'clerk')
        self.manager, self.manager_client = member_of(MANAGER, 'manager')

    def create_as_clerk(self, **values):
        body = {'name': 'Indus Traders', 'type': 'company', 'tax_id': 'NTN-1234567', 'country': self.country.pk, **values}
        return self.clerk_client.post('/api/data/core/contact/', body, format='json')

    # --- The access level -----------------------------------------------------

    def test_clerk_has_create_only_access_to_tax_id(self):
        self.assertEqual(field_access(self.clerk, Contact, ['tax_id'])['tax_id'], CREATE_ONLY)

    def test_manager_keeps_full_write(self):
        self.assertEqual(field_access(self.manager, Contact, ['tax_id'])['tax_id'], WRITE)

    def test_without_the_add_grant_the_field_is_read_only(self):
        viewer = make_user('viewer', 'core.view_contact', 'core.add_contact', 'core.change_contact', 'core.view_contact_tax_id')
        self.assertEqual(field_access(viewer, Contact, ['tax_id'])['tax_id'], READ)

    # --- The schema -----------------------------------------------------------

    def test_schema_marks_it_writable_in_create_mode_and_read_only_in_edit_mode(self):
        field = build_schema(Contact, self.clerk)['fields']['tax_id']
        self.assertFalse(field['read_only_on_create'])
        self.assertTrue(field['read_only'])
        self.assertEqual(field['write_once'], {'note': NOTE})
        self.assertFalse(build_schema(Contact, self.clerk, 'create')['fields']['tax_id']['read_only'])
        self.assertTrue(build_schema(Contact, self.clerk, 'edit')['fields']['tax_id']['read_only'])

    def test_manager_schema_has_no_write_once_mark(self):
        field = build_schema(Contact, self.manager)['fields']['tax_id']
        self.assertFalse(field['read_only'])
        self.assertFalse(field['read_only_on_create'])
        self.assertNotIn('write_once', field)

    def test_schema_endpoint_takes_a_mode_and_refuses_an_unknown_one(self):
        create = self.clerk_client.get('/api/schema/core/contact/?mode=create').json()
        edit = self.clerk_client.get('/api/schema/core/contact/?mode=edit').json()
        self.assertFalse(create['fields']['tax_id']['read_only'])
        self.assertTrue(edit['fields']['tax_id']['read_only'])
        self.assertEqual(self.clerk_client.get('/api/schema/core/contact/?mode=delete').status_code, 400)

    def test_other_restricted_fields_stay_read_only_on_create_for_the_clerk(self):
        fields = build_schema(Contact, self.clerk)['fields']
        self.assertTrue(fields['credit_limit']['read_only_on_create'])
        self.assertTrue(fields['active']['read_only_on_create'])
        self.assertNotIn('write_once', fields['credit_limit'])

    # --- The API --------------------------------------------------------------

    def test_clerk_creates_a_company_with_a_tax_id_and_it_is_audited(self):
        response = self.create_as_clerk()
        self.assertEqual(response.status_code, 201, response.content)
        contact = Contact.objects.get(pk=response.json()['id'])
        self.assertEqual(contact.tax_id, 'NTN-1234567')
        entry = audit_for(contact).get()
        self.assertEqual(entry.action, AuditEntry.ACTION_CREATE)
        self.assertEqual(entry.actor, self.clerk)
        self.assertEqual(entry.changes['tax_id'], {'before': None, 'after': 'NTN-1234567'})

    def test_clerk_patch_to_tax_id_is_refused_by_name(self):
        contact_id = self.create_as_clerk().json()['id']
        response = self.clerk_client.patch(f'/api/data/core/contact/{contact_id}/', {'tax_id': 'NTN-0000000'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'tax_id': [NOT_WRITABLE]})
        contact = Contact.objects.get(pk=contact_id)
        self.assertEqual(contact.tax_id, 'NTN-1234567')
        self.assertEqual(audit_for(contact).count(), 1)  # the create only

    def test_clerk_may_still_change_other_fields_on_the_record(self):
        contact_id = self.create_as_clerk().json()['id']
        response = self.clerk_client.patch(f'/api/data/core/contact/{contact_id}/', {'city': 'Karachi'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)

    def test_manager_patch_to_tax_id_is_accepted_and_audited_with_before_and_after(self):
        contact_id = self.create_as_clerk().json()['id']
        response = self.manager_client.patch(f'/api/data/core/contact/{contact_id}/', {'tax_id': 'NTN-7654321'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        contact = Contact.objects.get(pk=contact_id)
        self.assertEqual(contact.tax_id, 'NTN-7654321')
        update = audit_for(contact).last()
        self.assertEqual(update.action, AuditEntry.ACTION_UPDATE)
        self.assertEqual(update.actor, self.manager)
        self.assertEqual(update.changes['tax_id'], {'before': 'NTN-1234567', 'after': 'NTN-7654321'})

    def test_clerk_still_cannot_set_credit_limit_on_create(self):
        response = self.create_as_clerk(credit_limit='500000.00')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'credit_limit': [NOT_WRITABLE]})
