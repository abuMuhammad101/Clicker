"""
S-4: the list query grammar (filters), group headers with sums, the summary
strip, and saved views. Every rule has a test that proves it denies, and the
totals are checked against a fixture computed by hand, not against the code
that computes them.

Today is pinned to 3 Nov 2026 (Karachi) for every test here.
"""
import datetime
from decimal import Decimal
from unittest import mock

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from core.models import Contact, Country
from foundation.roles import CLERK, MANAGER
from foundation.test_roles import member_of
from foundation.testing import grant_everything, make_user
from schema.engine import build_schema
from userstate.models import SavedView
from workflowlab.models import LabBill

from .query import NOT_FILTERABLE, NOT_GROUPABLE
from .test_s2 import hide_country

TODAY = datetime.date(2026, 11, 3)
BILLS = '/api/data/workflowlab/labbill/'
CONTACTS = '/api/data/core/contact/'

# (customer, amount, state, issued_on, due_date) and, by hand, its days
# overdue on 3 Nov 2026 and aging bucket.
FIXTURE = [
    ('Indus Traders', '100000.00', 'posted', '2026-10-11', '2026-11-10'),  # -7: not yet due
    ('Lahore Steel Works', '250000.00', 'posted', '2026-09-20', '2026-10-20'),  # 14: 0–30
    ('Mehran Textiles', '40000.50', 'posted', '2026-08-16', '2026-09-15'),  # 49: 31–60
    ('Quetta Fruit Company', '75000.00', 'posted', '2026-07-21', '2026-08-20'),  # 75: 61–90
    ('Sindh Agro Exports', '1200000.00', 'posted', '2026-05-02', '2026-06-01'),  # 155: 90+
    ('Hyderabad Cotton Mills', '300000.00', 'posted', '2026-06-01', '2026-07-01'),  # 125: 90+
    ('Karachi Port Logistics', '9500.00', 'draft', '2026-11-03', '2026-12-03'),  # -30
    ('Karachi Cold Storage', '14500.00', 'cancelled', '2026-09-01', '2026-10-01'),  # 33
    ('Gwadar Fisheries', '60000.00', 'posted', '2026-11-02', None),  # no due date
]


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


def _date(text):
    return datetime.date.fromisoformat(text) if text else None


class S4TestCase(TestCase):
    def setUp(self):
        patcher = mock.patch('foundation.computed.today', return_value=TODAY)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.clerk, self.clerk_client = member_of(CLERK, 'clerk')
        self.manager, self.manager_client = member_of(MANAGER, 'manager')
        for customer, amount, state, issued, due in FIXTURE:
            LabBill.objects.create(
                customer=customer, amount=Decimal(amount), state=state, issued_on=_date(issued), due_date=_date(due)
            )

    def bills(self, client, *filters, **params):
        response = client.get(BILLS, {'filter': list(filters), 'limit': 200, **params})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def customers(self, client, *filters):
        return sorted(row['values']['customer'] for row in self.bills(client, *filters)['results'])

    def refused(self, client, url, *filters, **params):
        response = client.get(url, {'filter': list(filters), **params})
        self.assertEqual(response.status_code, 400, response.content)
        return response.json()


class FilterTests(S4TestCase):
    def test_text_operators(self):
        c = self.manager_client
        self.assertEqual(self.customers(c, 'customer:contains:karachi'), ['Karachi Cold Storage', 'Karachi Port Logistics'])
        self.assertEqual(self.customers(c, 'customer:is:mehran textiles'), ['Mehran Textiles'])
        # Everything after the second colon is the value, colons included.
        self.assertEqual(self.customers(c, 'customer:contains:a:b'), [])

    def test_selection_and_workflow_state_any_of(self):
        self.assertEqual(
            self.customers(self.manager_client, 'state:in:draft,cancelled'),
            ['Karachi Cold Storage', 'Karachi Port Logistics'],
        )

    def test_number_operators_on_money(self):
        c = self.manager_client
        self.assertEqual(
            self.customers(c, 'amount:between:40000,80000'),
            ['Gwadar Fisheries', 'Mehran Textiles', 'Quetta Fruit Company'],
        )
        self.assertEqual(self.customers(c, 'amount:eq:40000.50'), ['Mehran Textiles'])
        self.assertEqual(self.customers(c, 'amount:gte:1000000'), ['Sindh Agro Exports'])
        self.assertEqual(len(self.customers(c, 'amount:lte:14500')), 2)

    def test_date_operators_and_presets(self):
        c = self.manager_client
        self.assertEqual(self.customers(c, 'due_date:before:2026-08-01'), ['Hyderabad Cotton Mills', 'Sindh Agro Exports'])
        self.assertEqual(self.customers(c, 'due_date:on:2026-10-20'), ['Lahore Steel Works'])
        self.assertEqual(self.customers(c, 'due_date:empty'), ['Gwadar Fisheries'])
        self.assertEqual(self.customers(c, 'issued_on:preset:this_month'), ['Gwadar Fisheries', 'Karachi Port Logistics'])
        self.assertEqual(self.customers(c, 'issued_on:preset:last_month'), ['Indus Traders'])
        self.assertEqual(self.customers(c, 'issued_on:preset:today'), ['Karachi Port Logistics'])
        self.assertEqual(self.customers(c, 'due_date:older_than:100'), ['Hyderabad Cotton Mills', 'Sindh Agro Exports'])

    def test_computed_fields_filter_by_their_result_type(self):
        self.assertEqual(
            self.customers(self.manager_client, 'state:in:posted', 'days_overdue:gte:91'),
            ['Hyderabad Cotton Mills', 'Sindh Agro Exports'],
        )

    def test_filters_combine_and_the_count_follows(self):
        body = self.bills(self.manager_client, 'state:in:posted', 'amount:gte:100000')
        self.assertEqual(body['count'], 4)

    def test_boolean_and_many_to_one_on_contacts(self):
        pk = Country.objects.create(name='Pakistan', code='PK')
        Contact.objects.create(name='Acme', type='company', is_customer=True, country=pk)
        Contact.objects.create(name='Beta', type='company')
        c = self.manager_client

        def names(*filters):
            response = c.get(CONTACTS, {'filter': list(filters)})
            self.assertEqual(response.status_code, 200, response.content)
            return [row['values']['name'] for row in response.json()['results']]

        self.assertEqual(names('is_customer:is:true'), ['Acme'])
        self.assertEqual(names(f'country:in:{pk.pk}'), ['Acme'])
        self.assertEqual(names('country:empty'), ['Beta'])

    def test_a_bad_operator_is_a_400_with_a_sentence(self):
        body = self.refused(self.manager_client, BILLS, 'amount:contains:12')
        self.assertIn('“Amount” can’t be filtered with “contains”', body['filter'][0])

    def test_a_bad_value_is_a_400_never_a_500(self):
        for raw in [
            'amount:gte:lots',
            'amount:gte:NaN',
            'amount:between:9,1',
            'amount:between:1',
            'due_date:before:30/10/2026',
            'due_date:preset:next_decade',
            'due_date:older_than:-3',
            'state:in:paid',
            'state:in:',
            'amount',
            ':gte:1',
            'amount:',
            'due_date:empty:yes',
            'days_overdue:gte:1.5',
        ]:
            with self.subTest(raw=raw):
                body = self.refused(self.manager_client, BILLS, raw)
                self.assertTrue(body['filter'][0].endswith('.'), body)

    def test_an_unknown_field_and_an_unreadable_one_get_the_same_answer(self):
        Contact.objects.create(name='Acme', type='company', credit_limit=Decimal('500000'))
        reader = make_user('reader', 'core.view_contact')  # no grant on credit_limit
        client = client_for(reader)
        unreadable = self.refused(client, CONTACTS, 'credit_limit:gte:1')
        unknown = self.refused(client, CONTACTS, 'no_such_field:gte:1')
        self.assertEqual(unreadable, unknown)
        self.assertEqual(unreadable['filter'], [NOT_FILTERABLE])

    def test_the_picker_search_uses_the_same_rules(self):
        reader = make_user('reader', 'core.view_contact')
        self.refused(client_for(reader), CONTACTS + 'search/', 'credit_limit:gte:1')


class GroupTests(S4TestCase):
    def aggregate(self, client, *filters, **params):
        response = client.get(BILLS + 'aggregate/', {'filter': list(filters), **params})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def headers(self, groups):
        return [(g['label'], g['count'], g['sums']['amount']) for g in groups]

    def test_group_sums_by_state_match_the_hand_computed_fixture(self):
        groups = self.aggregate(self.manager_client, group_by='state')['groups']
        self.assertEqual(self.headers(groups), [
            ('Draft', 1, '9500.00'),
            ('Posted', 7, '2025000.50'),
            ('Cancelled', 1, '14500.00'),
        ])

    def test_aging_buckets_of_a_today_dependent_computed_field(self):
        groups = self.aggregate(self.manager_client, 'state:in:posted', group_by='days_overdue')['groups']
        self.assertEqual(self.headers(groups), [
            ('Not yet due', 1, '100000.00'),
            ('0–30 days', 1, '250000.00'),
            ('31–60 days', 1, '40000.50'),
            ('61–90 days', 1, '75000.00'),
            ('90+ days', 2, '1500000.00'),
            ('Other', 1, '60000.00'),  # no due date
        ])

    def test_a_group_filter_selects_exactly_its_rows(self):
        groups = self.aggregate(self.manager_client, 'state:in:posted', group_by='days_overdue')['groups']
        for group in groups:
            if group['filter'] is None:
                continue
            with self.subTest(group=group['label']):
                body = self.bills(self.manager_client, 'state:in:posted', group['filter'])
                self.assertEqual(body['count'], group['count'])

    def test_group_by_month(self):
        groups = self.aggregate(self.manager_client, 'state:in:posted', group_by='issued_on')['groups']
        self.assertEqual([(g['label'], g['count']) for g in groups], [
            ('May 2026', 1), ('Jun 2026', 1), ('Jul 2026', 1), ('Aug 2026', 1),
            ('Sep 2026', 1), ('Oct 2026', 1), ('Nov 2026', 1),
        ])

    def test_all_group_headers_are_one_aggregate_query(self):
        with CaptureQueriesContext(connection) as captured:
            self.aggregate(self.manager_client, 'state:in:posted', group_by='days_overdue')
        grouped = [q['sql'] for q in captured.captured_queries if 'GROUP BY' in q['sql']]
        self.assertEqual(len(grouped), 1)

    def test_group_by_a_link_names_only_what_the_user_may_see(self):
        pk = Country.objects.create(name='Pakistan', code='PK')
        hidden = Country.objects.create(name='Hiddenland', code='HL')
        Contact.objects.create(name='Acme', type='company', country=pk)
        Contact.objects.create(name='Beta', type='company', country=hidden)
        Contact.objects.create(name='Gamma', type='company')
        with hide_country(hidden.pk):
            response = self.manager_client.get(CONTACTS + 'aggregate/', {'group_by': 'country'})
        groups = response.json()['groups']
        self.assertEqual([(g['label'], g['count'], g.get('restricted', False)) for g in groups], [
            ('Pakistan', 1, False),
            (None, 1, True),
            ('No country', 1, False),
        ])

    def test_grouping_by_an_unreadable_or_ungroupable_field_is_refused(self):
        reader = make_user('reader', 'core.view_contact')
        for client, url, field in [
            (client_for(reader), CONTACTS, 'credit_limit'),
            (self.manager_client, BILLS, 'customer'),  # free text: no groups
            (self.manager_client, BILLS, 'nope'),
        ]:
            with self.subTest(field=field):
                response = client.get(url + 'aggregate/', {'group_by': field})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()['group_by'], [NOT_GROUPABLE])


class SummaryTests(S4TestCase):
    def summaries(self, client, url, *filters):
        response = client.get(url + 'aggregate/', {'filter': list(filters)})
        self.assertEqual(response.status_code, 200, response.content)
        return {s['label']: s['value'] for s in response.json()['summaries']}

    def test_summaries_match_the_hand_computed_fixture(self):
        self.assertEqual(self.summaries(self.manager_client, BILLS), {
            'Outstanding': '2025000.50',
            'Overdue': '1865000.50',
            'Posted this month': '60000.00',
            'Bills': '9',
        })

    def test_summaries_follow_the_list_filters(self):
        self.assertEqual(self.summaries(self.manager_client, BILLS, 'amount:gte:100000'), {
            'Outstanding': '1850000.00',
            'Overdue': '1750000.00',
            'Posted this month': '0.00',
            'Bills': '4',
        })

    def test_a_summary_over_an_unreadable_field_is_not_returned(self):
        Contact.objects.create(name='Acme', type='company', is_customer=True, credit_limit=Decimal('500000'))
        manager = self.summaries(self.manager_client, CONTACTS)
        self.assertEqual(manager['Credit extended'], '500000.00')
        reader = make_user('reader', 'core.view_contact')
        shown = self.summaries(client_for(reader), CONTACTS)
        self.assertEqual(shown, {'Contacts': '1', 'Customers': '1'})
        labels = [s['label'] for s in build_schema(Contact, reader)['list']['summaries']]
        self.assertNotIn('Credit extended', labels)


class SavedViewTests(S4TestCase):
    VIEWS = '/api/views/core/contact/'

    def test_module_views_come_from_the_schema(self):
        response = self.manager_client.get('/api/views/workflowlab/labbill/')
        views = {v['label']: v for v in response.json()['views']}
        overdue = views['Overdue over 90 days']
        self.assertEqual(overdue['kind'], 'module')
        self.assertEqual(overdue['state']['filters'], ['state:in:posted', 'days_overdue:gte:91'])
        self.assertEqual(overdue['state']['group_by'], 'days_overdue')
        self.assertFalse(overdue['editable'])

    def test_a_personal_view_is_saved_and_comes_back(self):
        state = {'filters': ['is_customer:is:true'], 'ordering': '-name', 'columns': ['name', 'email'], 'density': 'compact'}
        response = self.manager_client.post(self.VIEWS, {'label': 'My customers', 'state': state}, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        listed = {v['label']: v for v in self.manager_client.get(self.VIEWS).json()['views']}
        mine = listed['My customers']
        self.assertEqual((mine['kind'], mine['editable'], mine['dropped']), ('personal', True, 0))
        self.assertEqual(mine['state']['filters'], ['is_customer:is:true'])
        self.assertEqual(mine['state']['density'], 'compact')

    def test_a_clerk_applying_a_managers_view_gets_only_what_a_clerk_may_read(self):
        Contact.objects.create(name='Acme', type='company', credit_limit=Decimal('900000'))
        Contact.objects.create(name='Beta', type='company', credit_limit=Decimal('10'))
        state = {'filters': ['type:in:company', 'credit_limit:gte:100000'], 'columns': ['name', 'credit_limit']}
        self.manager_client.post(self.VIEWS, {'label': 'Big credit', 'state': state, 'shared': True}, format='json')

        reader = make_user('reader', 'core.view_contact')  # sees contacts, not credit limits
        client = client_for(reader)
        view = {v['label']: v for v in client.get(self.VIEWS).json()['views']}['Big credit']
        self.assertEqual(view['kind'], 'shared')
        self.assertEqual(view['dropped'], 2)  # the credit-limit filter and column
        self.assertEqual(view['state']['filters'], ['type:in:company'])
        self.assertEqual(view['state']['columns'], ['name'])

        # Applied as served: the reader's rows, without the hidden field.
        rows = client.get(CONTACTS, {'filter': view['state']['filters']}).json()['results']
        self.assertEqual(sorted(r['values']['name'] for r in rows), ['Acme', 'Beta'])
        self.assertTrue(all('credit_limit' not in r['values'] for r in rows))
        # Applied as the manager saved it: refused, not widened.
        self.refused(client, CONTACTS, *state['filters'])

    def test_an_unshared_view_is_private_and_only_its_owner_changes_it(self):
        created = self.manager_client.post(
            self.VIEWS, {'label': 'Mine', 'state': {'filters': []}}, format='json'
        ).json()
        other = grant_everything(make_user('other-manager'))
        client = client_for(other)
        self.assertNotIn('Mine', [v['label'] for v in client.get(self.VIEWS).json()['views']])
        url = f'{self.VIEWS}{created["id"]}/'
        self.assertEqual(client.patch(url, {'label': 'Theirs'}, format='json').status_code, 404)
        self.assertEqual(client.delete(url).status_code, 404)
        self.assertEqual(self.manager_client.patch(url, {'label': 'Renamed'}, format='json').status_code, 200)
        self.assertEqual(self.manager_client.delete(url).status_code, 204)
        self.assertFalse(SavedView.objects.exists())

    def test_a_view_cannot_be_saved_with_a_filter_its_owner_cannot_read(self):
        reader = make_user('reader', 'core.view_contact')
        response = client_for(reader).post(
            self.VIEWS, {'label': 'Peek', 'state': {'filters': ['credit_limit:gte:1']}}, format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['filter'], [NOT_FILTERABLE])

    def test_two_views_with_one_name_are_refused(self):
        body = {'label': 'Same', 'state': {'filters': []}}
        self.manager_client.post(self.VIEWS, body, format='json')
        response = self.manager_client.post(self.VIEWS, body, format='json')
        self.assertEqual(response.status_code, 400)

    def test_views_of_a_model_the_user_cannot_see_are_not_found(self):
        self.assertEqual(self.clerk_client.get('/api/views/catalog/product/').status_code, 404)
