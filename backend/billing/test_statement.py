"""A customer's statement: figures under the title, and the lists that follow the identity group."""
from django.test import TestCase

from foundation.test_roles import member_of

from .testing import BillingWorld


class StatementTests(BillingWorld, TestCase):
    def setUp(self):
        self.build_world()
        self.client_contact = self.customer()
        self.make_bill(self.client_contact, '1000.00', issue='2026-08-01')  # due 31 Aug: 64 days late on 3 Nov
        self.make_payment(self.client_contact, '250.00', 'REF-1')

    def record(self, client, pk=None):
        return client.get(f'/api/data/core/contact/{pk or self.client_contact.pk}/').json()

    def test_the_record_carries_its_figures_in_order(self):
        figures = {entry['label']: entry for entry in self.record(self.manager_client)['summaries']}
        self.assertEqual(list(figures), ['Outstanding', 'Oldest overdue (days)', 'Advance held', 'Open recovery cases'])
        self.assertEqual(figures['Outstanding']['value'], '750.00')
        self.assertEqual(figures['Outstanding']['type'], 'currency')
        self.assertEqual(figures['Oldest overdue (days)']['value'], '64')
        self.assertEqual(figures['Advance held']['value'], '0.00')
        self.assertEqual(figures['Open recovery cases']['value'], '0')

    def test_nothing_overdue_is_empty_not_zero(self):
        fresh = self.customer('Quiet Mills (demo)')
        figures = {entry['label']: entry for entry in self.record(self.manager_client, fresh.pk)['summaries']}
        self.assertIsNone(figures['Oldest overdue (days)']['value'])
        self.assertEqual(figures['Outstanding']['value'], '0.00')

    def test_a_figure_a_user_cannot_read_is_absent_from_schema_and_record(self):
        clerk, clerk_client = member_of('Clerk', 'clerk')
        schema = clerk_client.get('/api/schema/core/contact/').json()
        self.assertEqual(schema['record_summaries'], [])
        self.assertNotIn('summaries', self.record(clerk_client))

    def test_the_schema_leads_with_the_lists_not_an_account_group(self):
        schema = self.manager_client.get('/api/schema/core/contact/').json()
        self.assertEqual(schema['related_lists_after'], 'Identity')
        self.assertNotIn('Account', [group['label'] for group in schema['groups']])
        self.assertEqual(
            [entry['label'] for entry in schema['related_lists']][:4],
            ['Bills', 'Payments', 'Adjustments', 'Recovery cases'],
        )
        self.assertEqual([entry['label'] for entry in schema['record_summaries']][0], 'Outstanding')

    def test_the_figures_follow_the_read_rule_per_role(self):
        # The auditor reads everything the manager does; the cashier has no recovery grant,
        # so the open-case count is not offered to them.
        figures = [e['label'] for e in self.cashier_client.get('/api/schema/core/contact/').json()['record_summaries']]
        self.assertNotIn('Open recovery cases', figures)
        self.assertIn('Outstanding', figures)
