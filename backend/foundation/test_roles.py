"""
The Manager and Clerk roles end to end, through the API, as the sprint's S-1
gate states them. Each test proves a denial.
"""
import os
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from rest_framework.test import APIClient

from catalog.models import Product
from core.models import Contact, Country
from foundation.models import AuditEntry
from foundation.roles import CLERK, MANAGER

User = get_user_model()


def member_of(role, username):
    user = User.objects.create_user(username, password='not-a-real-password-1')
    user.groups.add(Group.objects.get(name=role))
    client = APIClient()
    client.force_login(user)
    return user, client


class RoleTests(TestCase):
    def setUp(self):
        self.country = Country.objects.create(name='Pakistan', code='PK')
        self.company = Contact.objects.create(
            name='Indus Traders', type='company', tax_id='NTN-1234567', country=self.country
        )
        self.product = Product.objects.create(name='Widget', sku='W-1')
        self.clerk, self.clerk_client = member_of(CLERK, 'clerk')
        self.manager, self.manager_client = member_of(MANAGER, 'manager')
        self.contact_url = f'/api/data/core/contact/{self.company.pk}/'

    # --- Clerk ---------------------------------------------------------------

    def test_clerk_contact_schema_marks_tax_id_read_only(self):
        fields = self.clerk_client.get('/api/schema/core/contact/').json()['fields']
        self.assertTrue(fields['tax_id']['read_only'])
        self.assertFalse(fields['name']['read_only'])

    def test_clerk_patch_to_tax_id_is_rejected(self):
        response = self.clerk_client.patch(self.contact_url, {'tax_id': 'NTN-0000000'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('tax_id', response.json())
        self.company.refresh_from_db()
        self.assertEqual(self.company.tax_id, 'NTN-1234567')

    def test_clerk_can_change_other_contact_fields(self):
        response = self.clerk_client.patch(self.contact_url, {'city': 'Karachi'}, format='json')
        self.assertEqual(response.status_code, 200)

    def test_clerk_can_create_contacts(self):
        response = self.clerk_client.post('/api/data/core/contact/', {'name': 'New'}, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        schema = self.clerk_client.get('/api/schema/core/contact/').json()
        self.assertTrue(schema['actions']['create'])

    def test_clerk_cannot_archive_a_contact(self):
        response = self.clerk_client.patch(self.contact_url, {'active': False}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('active', response.json())
        self.company.refresh_from_db()
        self.assertTrue(self.company.active)
        fields = self.clerk_client.get('/api/schema/core/contact/').json()['fields']
        self.assertTrue(fields['active']['read_only'])

    def test_clerk_reads_but_cannot_change_credit_limit(self):
        fields = self.clerk_client.get('/api/schema/core/contact/').json()['fields']
        self.assertTrue(fields['credit_limit']['read_only'])
        response = self.clerk_client.patch(self.contact_url, {'credit_limit': '500000.00'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('credit_limit', response.json())
        self.company.refresh_from_db()
        self.assertIsNone(self.company.credit_limit)

    def test_clerk_can_change_payment_terms_and_customer_since(self):
        response = self.clerk_client.patch(
            self.contact_url, {'payment_terms_days': 45, 'customer_since': '2026-10-30'}, format='json'
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.company.refresh_from_db()
        self.assertEqual(self.company.payment_terms_days, 45)
        self.assertEqual(str(self.company.customer_since), '2026-10-30')

    def test_clerk_gets_404_for_products_and_their_schema(self):
        for path in (
            '/api/data/catalog/product/',
            f'/api/data/catalog/product/{self.product.pk}/',
            '/api/schema/catalog/product/',
            '/api/data/catalog/product/search/?q=wid',
        ):
            self.assertEqual(self.clerk_client.get(path).status_code, 404, path)

    def test_product_is_absent_from_the_clerks_registry(self):
        apps = self.clerk_client.get('/api/registry/').json()['apps']
        models = {(app['app_label'], entry['model']) for app in apps for entry in app['models']}
        self.assertNotIn(('catalog', 'product'), models)
        self.assertIn(('core', 'contact'), models)

    def test_clerk_sort_or_filter_on_a_field_they_cant_read_is_refused(self):
        # Server-owned fields are readable by no one through the API.
        sort = self.clerk_client.get('/api/data/core/contact/?ordering=created_by')
        self.assertEqual(sort.status_code, 400)
        filtered = self.clerk_client.get('/api/data/core/contact/search/?created_by=1')
        self.assertEqual(filtered.status_code, 400)

    def test_clerk_write_is_audited_once_with_before_and_after(self):
        before = AuditEntry.objects.count()
        self.clerk_client.patch(self.contact_url, {'city': 'Karachi'}, format='json')
        self.assertEqual(AuditEntry.objects.count(), before + 1)
        entry = AuditEntry.objects.latest('id')
        self.assertEqual(entry.actor, self.clerk)
        self.assertEqual(entry.changes, {'city': {'before': '', 'after': 'Karachi'}})

    # --- Manager -------------------------------------------------------------

    def test_manager_can_edit_tax_id(self):
        response = self.manager_client.patch(self.contact_url, {'tax_id': 'NTN-7654321'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.tax_id, 'NTN-7654321')

    def test_manager_sees_products(self):
        self.assertEqual(self.manager_client.get('/api/data/catalog/product/').status_code, 200)


class SeedRolesCommandTests(TestCase):
    def run_command(self, **env):
        with mock.patch.dict(os.environ, env):
            out = StringIO()
            call_command('seed_roles', stdout=out)
            return out.getvalue()

    def test_creates_the_clerk_test_user_from_env_without_printing_credentials(self):
        output = self.run_command(DEV_CLERK_USERNAME='test-clerk', DEV_CLERK_PASSWORD='a-long-local-test-pass-9')
        user = User.objects.get(username='test-clerk')
        self.assertEqual(list(user.groups.values_list('name', flat=True)), [CLERK])
        self.assertFalse(user.is_staff or user.is_superuser)
        self.assertTrue(user.check_password('a-long-local-test-pass-9'))
        self.assertNotIn('test-clerk', output)
        self.assertNotIn('a-long-local-test-pass-9', output)

    def test_refuses_to_take_over_a_staff_or_manager_account(self):
        User.objects.create_user('hassan', password='x', is_staff=True)
        with self.assertRaises(CommandError):
            self.run_command(DEV_CLERK_USERNAME='hassan', DEV_CLERK_PASSWORD='a-long-local-test-pass-9')
        self.assertFalse(User.objects.get(username='hassan').groups.exists())

    def test_without_env_it_only_applies_roles(self):
        output = self.run_command(DEV_CLERK_USERNAME='', DEV_CLERK_PASSWORD='')
        self.assertIn('DEV_CLERK_USERNAME', output)
        self.assertTrue(Group.objects.filter(name=CLERK).exists())
