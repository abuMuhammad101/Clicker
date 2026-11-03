"""
S-5, Journey A: billing runs, connections, recovery cases, the first record
rule, automation, and archived-means-read-only. Through the API, as the roles
that use it. Today is 3 Nov 2026 (Karachi).
"""
import datetime
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from billing.models import Bill
from billing.testing import ADJUSTMENTS, BILLS, BillingWorld, money
from core.models import Contact
from foundation import automation
from foundation.models import AuditEntry
from schema.engine import build_schema

from .models import BillingRun, Connection, ConnectionBill, RecoveryCase, Tariff

CONNECTIONS = '/api/data/water/connection/'
RUNS = '/api/data/water/billingrun/'
CASES = '/api/data/water/recoverycase/'
CONTACTS = '/api/data/core/contact/'


class WaterWorld(BillingWorld):
    def build_water(self):
        self.build_world()
        self.tariff = Tariff.objects.create(
            name='Industrial 2025/26',
            category='industrial',
            rate_per_kgal=Decimal('300.00'),
            sewerage_percent=Decimal('35.00'),
            effective_from=datetime.date(2025, 7, 1),
        )
        self.mill = self.customer('Korangi Textiles (demo)')
        self.port = self.customer('Port Authority (demo)')

    def connect(self, number, consumer, district='korangi', kgal='10.000', status='active', basis='average'):
        response = self.officer_client.post(
            CONNECTIONS,
            {
                'number': number,
                'consumer': consumer.pk,
                'district': district,
                'tariff': self.tariff.pk,
                'size_mm': 150,
                'billing_basis': basis,
                'meter_number': 'M-1' if basis == 'metered' else '',
                'assessed_monthly_kgal': kgal,
                'status': status,
            },
            format='json',
        )
        assert response.status_code == 201, response.content
        return Connection.objects.get(pk=response.json()['id'])

    def make_run(self, period='2026-10-01', district=''):
        response = self.officer_client.post(
            RUNS, {'period': period, 'district': district, 'issue_date': '2026-10-31'}, format='json'
        )
        assert response.status_code == 201, response.content
        return BillingRun.objects.get(pk=response.json()['id'])


class BillingRunTests(WaterWorld, TestCase):
    def setUp(self):
        self.build_water()
        self.c1 = self.connect('CON-KHI-00001', self.mill)
        self.c2 = self.connect('CON-KHI-00002', self.port, district='keamari')
        self.c3 = self.connect('CON-KHI-00003', self.port, district='keamari', status='disconnected')

    def generate(self, run):
        return self.officer_client.post(f'{RUNS}{run.pk}/transitions/generate/', format='json')

    def test_a_run_makes_exactly_one_draft_bill_per_active_connection(self):
        run = self.make_run()
        self.assertEqual(self.generate(run).status_code, 200)
        links = ConnectionBill.objects.filter(run=run)
        self.assertEqual(sorted(links.values_list('connection__number', flat=True)), ['CON-KHI-00001', 'CON-KHI-00002'])
        self.assertEqual(Bill.objects.count(), 2)
        bill = links.get(connection=self.c1).bill
        self.assertEqual(bill.state, 'draft')
        self.assertEqual(bill.customer, self.mill)
        self.assertEqual(bill.issue_date, datetime.date(2026, 10, 31))
        self.assertEqual(bill.due_date, datetime.date(2026, 11, 30))
        # 10 thousand gallons × Rs 300 = 3,000.00; sewerage 35% = 1,050.00.
        self.assertEqual([(l.description[:12], l.amount_value) for l in bill.lines.all()], [
            ('Water charge', money('3000.00')),
            ('Sewerage, 35', money('1050.00')),
        ])
        self.assertEqual(bill.amount_total, money('4050.00'))
        row = self.officer_client.get(f'{RUNS}{run.pk}/').json()['values']
        self.assertEqual((row['state'], row['bills'], row['total_billed']), ('generated', 2, '8100.00'))

    def test_every_bill_the_run_makes_is_audited_under_the_person_who_ran_it(self):
        run = self.make_run()
        self.generate(run)
        bill = ConnectionBill.objects.get(run=run, connection=self.c1).bill
        entries = AuditEntry.objects.filter(
            content_type=ContentType.objects.get_for_model(Bill), record_id=str(bill.pk)
        )
        self.assertTrue(entries.exists())
        self.assertEqual({e.actor_id for e in entries}, {self.officer.pk})

    def test_a_district_run_bills_only_that_district(self):
        run = self.make_run(district='korangi')
        self.generate(run)
        self.assertEqual(list(ConnectionBill.objects.values_list('connection__number', flat=True)), ['CON-KHI-00001'])

    def test_running_a_month_twice_for_the_same_connections_is_refused(self):
        self.generate(self.make_run())
        again = self.make_run()
        response = self.generate(again)
        self.assertEqual(response.status_code, 409)
        self.assertIn('already have a bill for October 2026', response.json()['detail'])
        self.assertEqual(Bill.objects.count(), 2)  # nothing half-made
        again.refresh_from_db()
        self.assertEqual(again.state, 'draft')
        # A different month is a different bill; the database holds the line too.
        self.assertEqual(self.generate(self.make_run(period='2026-09-01')).status_code, 200)
        self.assertEqual(Bill.objects.count(), 4)

    def test_a_run_with_nothing_to_bill_says_so(self):
        response = self.generate(self.make_run(district='west'))
        self.assertEqual(response.status_code, 409)
        self.assertIn('no active connections', response.json()['detail'])

    def test_post_all_posts_every_bill_and_locks_the_run(self):
        run = self.make_run()
        self.generate(run)
        response = self.officer_client.post(f'{RUNS}{run.pk}/transitions/post_all/', format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(Bill.objects.values_list('state', flat=True)), {'posted'})
        locked = self.officer_client.patch(f'{RUNS}{run.pk}/', {'issue_date': '2026-11-01'}, format='json')
        self.assertEqual(locked.status_code, 409)

    def test_a_cashier_cannot_run_billing(self):
        self.assertEqual(self.cashier_client.post(RUNS, {'period': '2026-10-01'}, format='json').status_code, 404)

    def test_a_period_is_the_first_of_a_month(self):
        response = self.officer_client.post(RUNS, {'period': '2026-10-15'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('period', response.json())


class ConnectionTests(WaterWorld, TestCase):
    def setUp(self):
        self.build_water()

    def test_the_connection_number_is_set_once_and_only_a_manager_changes_it(self):
        connection = self.connect('CON-KHI-00001', self.mill)
        schema = self.officer_client.get('/api/schema/water/connection/').json()['fields']['number']
        self.assertTrue(schema['read_only'])
        self.assertFalse(schema['read_only_on_create'])
        self.assertIn('Set when the record is created', schema['write_once']['note'])
        denied = self.officer_client.patch(f'{CONNECTIONS}{connection.pk}/', {'number': 'CON-KHI-99999'}, format='json')
        self.assertEqual(denied.status_code, 400)
        self.assertEqual(
            self.manager_client.patch(f'{CONNECTIONS}{connection.pk}/', {'number': 'CON-KHI-99999'}, format='json').status_code,
            200,
        )

    def test_a_number_must_look_like_one_and_be_unique(self):
        self.connect('CON-KHI-00001', self.mill)
        for number in ('KHI-1', 'CON-KHI-00001'):
            response = self.officer_client.post(
                CONNECTIONS,
                {'number': number, 'consumer': self.mill.pk, 'district': 'east', 'tariff': self.tariff.pk,
                 'size_mm': 100, 'assessed_monthly_kgal': '1.000'},
                format='json',
            )
            self.assertEqual(response.status_code, 400, number)

    def test_a_metered_connection_needs_its_meter_number(self):
        response = self.officer_client.post(
            CONNECTIONS,
            {'number': 'CON-KHI-00009', 'consumer': self.mill.pk, 'district': 'east', 'tariff': self.tariff.pk,
             'size_mm': 100, 'billing_basis': 'metered', 'assessed_monthly_kgal': '1.000'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('meter_number', response.json())

    def test_the_strip_counts_connections_billed_on_averages_first(self):
        self.connect('CON-KHI-00001', self.mill)
        self.connect('CON-KHI-00002', self.mill, basis='metered')
        self.connect('CON-KHI-00003', self.port, basis='average')
        strip = self.manager_client.get(CONNECTIONS + 'aggregate/').json()['summaries']
        self.assertEqual([(s['label'], s['value']) for s in strip][:3], [('Billed on averages', '2'), ('Connections', '3'), ('Disputed', '0')])
        groups = self.manager_client.get(CONNECTIONS + 'aggregate/', {'group_by': 'billing_basis'}).json()['groups']
        self.assertEqual([(g['label'], g['count']) for g in groups], [('Metered', 1), ('Average', 2)])
        by_district = self.manager_client.get(CONNECTIONS + 'aggregate/', {'group_by': 'district'}).json()['groups']
        self.assertEqual([(g['label'], g['count']) for g in by_district], [('Korangi', 3)])


class RecoveryTests(WaterWorld, TestCase):
    def setUp(self):
        self.build_water()
        # The mill is 202 days overdue; the port is not due yet.
        self.late = self.make_bill(self.mill, '1000.00', issue='2026-03-01')
        self.fresh = self.make_bill(self.port, '500.00', issue='2026-10-20')

    def case(self, consumer, owner=None, **values):
        from foundation import actions

        return actions.create(actions.system_context(), RecoveryCase, consumer=consumer, owner=owner, **values)

    def test_automation_opens_a_case_for_every_overdue_consumer_without_one(self):
        report = dict(automation.run_all())
        self.assertEqual(report['open_recovery_cases'], 'opened 1 recovery case')
        case = RecoveryCase.objects.get()
        self.assertEqual((case.consumer, case.owner, case.state), (self.mill, None, 'open'))
        self.assertEqual(case.amount_opened, money('1000.00'))  # what was owed the day it opened
        # Running it again opens nothing: it is safe to schedule.
        self.assertEqual(dict(automation.run_all())['open_recovery_cases'], 'opened 0 recovery cases')
        self.assertEqual(RecoveryCase.objects.count(), 1)

    def test_automations_audit_entries_name_the_system_actor_never_a_person_or_blank(self):
        automation.run_all()
        case = RecoveryCase.objects.get()
        entry = AuditEntry.objects.get(content_type=ContentType.objects.get_for_model(RecoveryCase), record_id=str(case.pk))
        self.assertEqual(entry.actor.get_full_name(), 'Clicker automation')
        self.assertEqual(entry.actor_username, 'clicker-automation')
        self.assertIn('Opened by Clicker automation', entry.summary)
        self.assertFalse(entry.actor.has_usable_password())
        history = self.manager_client.get(f'{CASES}{case.pk}/history/').json()['results']
        self.assertEqual(history[0]['actor']['display_name'], 'Clicker automation')
        self.assertEqual(case.created_by.get_full_name(), 'Clicker automation')

    def test_a_consumer_with_a_case_open_gets_no_second_one(self):
        self.case(self.mill)
        self.assertEqual(dict(automation.run_all())['open_recovery_cases'], 'opened 0 recovery cases')
        with self.assertRaises(Exception):
            self.case(self.mill)

    def test_a_recovery_officer_sees_only_their_own_cases_and_those_consumers_bills(self):
        mine = self.case(self.mill, owner=self.staff['recovery'])
        theirs = self.case(self.port, owner=self.staff['recovery2'])
        unowned = self.case(self.customer('Garrison Engineers Malir (demo)'))
        client = self.recovery_client
        self.assertEqual(client.get(f'{CASES}{mine.pk}/').status_code, 200)
        for other in (theirs, unowned):
            self.assertEqual(client.get(f'{CASES}{other.pk}/').status_code, 404)
        listed = client.get(CASES).json()
        self.assertEqual([r['id'] for r in listed['results']], [mine.pk])
        # Their consumers' bills, and no one else's.
        self.assertEqual(client.get(f'{BILLS}{self.late.pk}/').status_code, 200)
        self.assertEqual(client.get(f'{BILLS}{self.fresh.pk}/').status_code, 404)
        self.assertEqual([r['id'] for r in client.get(BILLS).json()['results']], [self.late.pk])
        self.assertEqual([r['id'] for r in client.get(CONTACTS).json()['results']], [self.mill.pk])
        # Totals follow the same rule: no peeking through a count or a sum.
        self.assertEqual(client.get(BILLS + 'aggregate/').json()['summaries'][3]['value'], '1')
        # Everyone else reads it all.
        for reader in (self.manager_client, self.auditor_client, self.officer_client):
            self.assertEqual(reader.get(f'{CASES}{theirs.pk}/').status_code, 200)
        self.assertEqual(self.manager_client.get(CASES).json()['count'], 3)

    def test_a_recovery_officer_can_not_take_a_case_or_change_who_owns_it(self):
        mine = self.case(self.mill, owner=self.staff['recovery'])
        response = self.recovery_client.patch(f'{CASES}{mine.pk}/', {'owner': self.staff['recovery2'].pk}, format='json')
        self.assertEqual(response.status_code, 400)
        theirs = self.case(self.port, owner=self.staff['recovery2'])
        self.assertEqual(self.recovery_client.patch(f'{CASES}{theirs.pk}/', {'next_action': 'x'}, format='json').status_code, 404)
        note = self.recovery_client.patch(f'{CASES}{mine.pk}/', {'next_action': 'Call the finance office', 'next_action_date': '2026-11-10'}, format='json')
        self.assertEqual(note.status_code, 200)
        self.assertEqual(self.manager_client.patch(f'{CASES}{mine.pk}/', {'owner': self.staff['recovery2'].pk}, format='json').status_code, 200)
        self.assertEqual(self.recovery_client.get(f'{CASES}{mine.pk}/').status_code, 404)  # no longer theirs

    def test_stages_are_the_officers_but_disconnection_and_write_off_are_a_managers(self):
        mine = self.case(self.mill, owner=self.staff['recovery'])
        base = CASES
        for name in ('notice_1', 'notice_2', 'legal'):
            self.assertEqual(self.transition(self.recovery_client, base, mine, name).status_code, 200, name)
        denied = self.transition(self.recovery_client, base, mine, 'order_disconnection')
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.transition(self.recovery_client, base, mine, 'write_off').status_code, 403)
        schema = build_schema(RecoveryCase, self.recovery)
        self.assertNotIn('order_disconnection', [t['name'] for t in schema['workflow']['transitions']])
        ordered = self.transition(self.manager_client, base, mine, 'order_disconnection')
        self.assertEqual(ordered.status_code, 200)
        mine.refresh_from_db()
        self.assertEqual(mine.state, 'disconnection_ordered')  # never automatic: a person did it, once

    def test_a_case_is_written_off_only_after_approved_adjustments_clear_the_balance(self):
        mine = self.case(self.mill, owner=self.staff['recovery'])
        for name in ('notice_1', 'notice_2', 'legal'):
            self.transition(self.recovery_client, CASES, mine, name)
        refused = self.transition(self.manager_client, CASES, mine, 'write_off')
        self.assertEqual(refused.status_code, 409)
        self.assertIn('still owes Rs 1,000.00', refused.json()['detail'])
        adjustment = self.make_adjustment(self.late, '1000.00', kind='write_off', reason='Irrecoverable: consumer dissolved')
        self.transition(self.other_manager_client, ADJUSTMENTS, adjustment, 'approve')
        self.assertEqual(self.transition(self.manager_client, CASES, mine, 'write_off').status_code, 200)
        mine.refresh_from_db()
        self.assertEqual(mine.state, 'written_off')

    def test_a_case_cannot_be_settled_while_money_is_owed(self):
        mine = self.case(self.mill, owner=self.staff['recovery'])
        self.assertEqual(self.transition(self.recovery_client, CASES, mine, 'settle').status_code, 409)
        self.make_payment(self.mill, '1000.00', 'TX-9')
        self.assertEqual(self.transition(self.recovery_client, CASES, mine, 'settle').status_code, 200)

    def test_the_needs_an_owner_view_lists_unowned_open_cases(self):
        self.case(self.mill, owner=self.staff['recovery'])
        self.case(self.port)
        views = {v['label']: v for v in self.manager_client.get('/api/views/water/recoverycase/').json()['views']}
        filters = views['Needs an owner']['state']['filters']
        rows = self.manager_client.get(CASES, {'filter': filters}).json()['results']
        self.assertEqual([r['labels']['consumer'] for r in rows], ['Port Authority (demo)'])


class ArchivedMeansReadOnlyTests(WaterWorld, TestCase):
    def setUp(self):
        self.build_water()

    def test_an_archived_contact_cannot_be_edited_until_it_is_restored(self):
        url = f'{CONTACTS}{self.mill.pk}/'
        self.assertEqual(self.manager_client.patch(url, {'active': False}, format='json').status_code, 200)
        response = self.manager_client.patch(url, {'city': 'Karachi'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertIn('archived', response.json()['detail'])
        # Not even a name together with the restore: the restore is its own act.
        mixed = self.manager_client.patch(url, {'active': True, 'city': 'Karachi'}, format='json')
        self.assertEqual(mixed.status_code, 409)
        self.assertEqual(self.manager_client.patch(url, {'active': True}, format='json').status_code, 200)
        self.assertEqual(self.manager_client.patch(url, {'city': 'Karachi'}, format='json').status_code, 200)

    def test_archiving_still_leaves_the_record_visible_to_what_points_at_it(self):
        self.manager_client.patch(f'{CONTACTS}{self.mill.pk}/', {'active': False}, format='json')
        self.assertEqual(self.manager_client.get(f'{CONTACTS}{self.mill.pk}/').status_code, 200)
