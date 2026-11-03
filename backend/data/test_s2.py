"""
S-2: relation scoping, restricted labels, money as strings, computed fields,
related lists and the list's exact-match filter. Each rule has a test that
proves it denies.
"""
import datetime
import os
from decimal import Decimal
from io import StringIO
from unittest import mock

from django.contrib.auth.models import Group
from django.core.management import call_command
from django.db.models import Q
from django.test import TestCase
from rest_framework.test import APIClient

import data.access
from catalog.models import Product
from core.models import Contact, Country
from foundation import computed
from foundation.models import AuditEntry
from foundation.roles import CLERK, MANAGER
from foundation.testing import grant_everything, make_user
from schema.engine import build_schema


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


class Base(TestCase):
    def setUp(self):
        self.pk_country = Country.objects.create(name='Pakistan', code='PK')
        self.hidden_country = Country.objects.create(name='Hiddenland', code='HL')
        self.company = Contact.objects.create(name='Indus Traders', type='company', country=self.pk_country)
        self.manager = grant_everything(make_user('manager'))
        self.client = client_for(self.manager)
        self.url = f'/api/data/core/contact/{self.company.pk}/'


def hide_country(pk):
    """
    Stand-in for a record rule (S-6): the user can see the Country model but
    not this one country. Wraps the one enforcement point, as a record rule will.
    """
    real = data.access.scoped_queryset

    def scoped(user, model, action='view'):
        queryset = real(user, model, action)
        return queryset.exclude(pk=pk) if model is Country else queryset

    return mock.patch.object(data.access, 'scoped_queryset', scoped)


class RelationScopeTests(Base):
    def test_linking_to_a_record_the_user_cant_see_is_refused(self):
        with hide_country(self.hidden_country.pk):
            response = self.client.patch(self.url, {'country': self.hidden_country.pk}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('country', response.json())
        self.company.refresh_from_db()
        self.assertEqual(self.company.country, self.pk_country)

    def test_a_hidden_and_a_missing_record_get_the_same_error(self):
        with hide_country(self.hidden_country.pk):
            hidden = self.client.patch(self.url, {'country': self.hidden_country.pk}, format='json').json()
            missing = self.client.patch(self.url, {'country': 999999}, format='json').json()
        self.assertEqual(hidden, missing)

    def test_linking_to_a_visible_record_works(self):
        response = self.client.patch(self.url, {'country': self.hidden_country.pk}, format='json')
        self.assertEqual(response.status_code, 200)

    def test_creating_with_a_hidden_link_is_refused_too(self):
        with hide_country(self.hidden_country.pk):
            response = self.client.post('/api/data/core/contact/', {'name': 'X', 'country': self.hidden_country.pk}, format='json')
        self.assertEqual(response.status_code, 400)


class RestrictedLabelTests(Base):
    def test_label_of_an_unviewable_target_model_is_null_and_restricted(self):
        user = make_user('no-countries', 'core.view_contact')
        record = client_for(user).get(self.url).json()
        self.assertEqual(record['values']['country'], self.pk_country.pk)
        self.assertIsNone(record['labels']['country'])
        self.assertTrue(record['restricted']['country'])
        listed = client_for(user).get('/api/data/core/contact/').json()['results']
        self.assertTrue(all(row['labels'].get('country') is None for row in listed))

    def test_label_of_an_unviewable_target_record_is_null_and_restricted(self):
        self.company.country = self.hidden_country
        self.company.save()
        with hide_country(self.hidden_country.pk):
            record = self.client.get(self.url).json()
        self.assertIsNone(record['labels']['country'])
        self.assertEqual(record['restricted'], {'country': True})

    def test_a_visible_link_has_its_label_and_no_marker(self):
        record = self.client.get(self.url).json()
        self.assertEqual(record['labels']['country'], 'Pakistan')
        self.assertEqual(record['restricted'], {})


class MoneyAndTypesTests(Base):
    def setUp(self):
        super().setUp()
        self.product = Product.objects.create(
            name='Widget', sku='W-1', sales_price=Decimal('1245000.00'), cost=Decimal('1000000.10')
        )

    def test_money_travels_as_a_string_never_a_float(self):
        record = self.client.get(f'/api/data/catalog/product/{self.product.pk}/').json()
        self.assertEqual(record['values']['sales_price'], '1245000.00')
        self.assertEqual(record['values']['margin'], '244999.90')

    def test_currency_is_declared_in_the_schema(self):
        fields = build_schema(Product, self.manager)['fields']
        self.assertEqual(fields['sales_price']['type'], 'currency')
        self.assertEqual(fields['sales_price']['currency'], 'PKR')

    def test_integer_bounds_come_from_validators(self):
        field = build_schema(Contact, self.manager)['fields']['payment_terms_days']
        self.assertEqual((field['type'], field['min_value'], field['max_value'], field['default']), ('integer', 0, 365, 30))

    def test_a_date_is_stored_and_returned_as_iso(self):
        self.client.patch(self.url, {'customer_since': '2026-10-30'}, format='json')
        self.assertEqual(self.client.get(self.url).json()['values']['customer_since'], '2026-10-30')

    def test_record_meta_carries_audit_times_and_people(self):
        self.client.patch(self.url, {'city': 'Karachi'}, format='json')
        meta = self.client.get(self.url).json()['meta']
        self.assertEqual(meta['updated_by']['display_name'], 'manager')
        self.assertIn('T', meta['updated_at'])

    def test_organisation_settings_reach_the_frontend(self):
        organisation = self.client.get('/api/auth/me/').json()['organisation']
        self.assertEqual(organisation['currency']['code'], 'PKR')
        self.assertEqual(organisation['time_zone'], 'Asia/Karachi')


class ComputedFieldTests(Base):
    def setUp(self):
        super().setUp()
        Product.objects.create(name='Low', sku='L', sales_price=Decimal('10.00'), cost=Decimal('9.00'))
        Product.objects.create(name='High', sku='H', sales_price=Decimal('100.00'), cost=Decimal('10.00'))
        Product.objects.create(name='Mid', sku='M', sales_price=Decimal('50.00'), cost=Decimal('20.00'))

    def test_margin_is_read_only_and_explains_itself(self):
        field = build_schema(Product, self.manager)['fields']['margin']
        self.assertTrue(field['read_only'])
        self.assertEqual(field['computed'], {'from': ['sales_price', 'cost'], 'description': 'Sales price − Cost'})

    def test_margin_sorts_in_the_database(self):
        rows = self.client.get('/api/data/catalog/product/?ordering=-margin').json()['results']
        self.assertEqual([r['values']['name'] for r in rows], ['High', 'Mid', 'Low'])

    def test_margin_filters_in_the_database(self):
        rows = self.client.get('/api/data/catalog/product/?margin=30.00').json()['results']
        self.assertEqual([r['values']['name'] for r in rows], ['Mid'])

    def test_margin_is_never_writable(self):
        product = Product.objects.get(sku='H')
        patch = self.client.patch(f'/api/data/catalog/product/{product.pk}/', {'margin': '1.00'}, format='json')
        self.assertEqual(patch.status_code, 400)
        self.assertIn('margin', patch.json())
        post = self.client.post('/api/data/catalog/product/', {'name': 'X', 'sku': 'X', 'margin': '5'}, format='json')
        self.assertEqual(post.status_code, 400)

    def test_margin_is_not_audited(self):
        product = Product.objects.get(sku='H')
        self.client.patch(f'/api/data/catalog/product/{product.pk}/', {'cost': '20.00'}, format='json')
        entry = AuditEntry.objects.filter(record_id=str(product.pk)).latest('id')
        self.assertEqual(set(entry.changes), {'cost'})

    def test_a_value_derived_from_a_hidden_field_is_hidden(self):
        user = make_user('no-cost', 'catalog.view_product')
        with mock.patch.object(Product.Schema, 'restricted_fields', ['cost'], create=True):
            schema = build_schema(Product, user)
            self.assertNotIn('cost', schema['fields'])
            self.assertNotIn('margin', schema['fields'])
            self.assertNotIn('margin', schema['list']['columns'])
            client = client_for(user)
            self.assertEqual(client.get('/api/data/catalog/product/?ordering=margin').status_code, 400)
            self.assertEqual(client.get('/api/data/catalog/product/?margin=30.00').status_code, 400)
            row = client.get('/api/data/catalog/product/').json()['results'][0]
            self.assertNotIn('margin', row['values'])

    def test_a_value_that_depends_on_today(self):
        Contact.objects.filter(pk=self.company.pk).update(customer_since=datetime.date(2026, 10, 1))
        Contact.objects.create(name='Recent', customer_since=datetime.date(2026, 10, 25))
        declared = {
            'days_as_customer': {
                'label': 'Days as customer',
                'type': 'integer',
                'expression': computed.days_since('customer_since'),
            }
        }
        with (
            mock.patch.object(Contact.Schema, 'computed', declared, create=True),
            mock.patch.object(Contact.Schema, 'groups', [{'label': 'All', 'fields': ['name', 'days_as_customer']}]),
            mock.patch.object(computed, 'today', lambda: datetime.date(2026, 10, 30)),
        ):
            field = build_schema(Contact, self.manager)['fields']['days_as_customer']
            self.assertEqual(field['computed']['description'], 'Days from Customer since to today')
            rows = self.client.get('/api/data/core/contact/?ordering=-days_as_customer').json()['results']
            dated = [(r['values']['name'], r['values']['days_as_customer']) for r in rows if r['values']['days_as_customer'] is not None]
            self.assertEqual(dated, [('Indus Traders', 29), ('Recent', 5)])
            # Tomorrow it's a day older, with no data changed: computed per request.
            with mock.patch.object(computed, 'today', lambda: datetime.date(2026, 10, 31)):
                row = self.client.get(self.url).json()
            self.assertEqual(row['values']['days_as_customer'], 30)


class RelatedListTests(Base):
    def setUp(self):
        super().setUp()
        self.person = Contact.objects.create(name='Amina', type='person', parent=self.company)
        Product.objects.create(name='Bolt', sku='B-1', supplier=self.company)

    def test_a_company_lists_people_and_products_supplied(self):
        lists = build_schema(Contact, self.manager)['related_lists']
        # The statement (bills, payments, adjustments) follows, then what a water utility adds.
        self.assertEqual(
            [(rl['label'], rl['field'], rl['can_add']) for rl in lists][:3],
            [('People', 'parent', True), ('Products supplied', 'supplier', True), ('Bills', 'customer', True)],
        )
        self.assertEqual(
            [rl['label'] for rl in lists],
            ['People', 'Products supplied', 'Bills', 'Payments', 'Adjustments', 'Connections', 'Recovery cases'],
        )

    def test_a_clerk_sees_people_but_not_products_supplied(self):
        clerk = make_user('clerk')
        clerk.groups.add(Group.objects.get(name=CLERK))
        lists = build_schema(Contact, clerk)['related_lists']
        self.assertEqual([rl['label'] for rl in lists], ['People'])
        self.assertTrue(lists[0]['can_add'])

    def test_the_list_filters_to_this_parent(self):
        rows = self.client.get(f'/api/data/core/contact/?parent={self.company.pk}').json()
        self.assertEqual((rows['count'], rows['results'][0]['values']['name']), (1, 'Amina'))

    def test_the_related_list_filter_refuses_unreadable_fields(self):
        viewer = client_for(make_user('viewer', 'core.view_contact'))
        hidden = viewer.get('/api/data/core/contact/?tax_id=NTN-1')
        self.assertEqual(hidden.status_code, 400)
        server_owned = viewer.get('/api/data/core/contact/?created_by=1')
        self.assertEqual(server_owned.status_code, 400)
        self.assertEqual(viewer.get(f'/api/data/core/contact/?parent={self.company.pk}').status_code, 200)


class SeedRolesS2Tests(TestCase):
    def test_dev_verify_gets_the_manager_role(self):
        user = make_user('dev-verify')
        with mock.patch.dict(os.environ, {'DEV_TEST_USERNAME': '', 'DEV_CLERK_USERNAME': '', 'DEV_CLERK_PASSWORD': ''}):
            call_command('seed_roles', stdout=StringIO())
        self.assertTrue(user.groups.filter(name=MANAGER).exists())
