"""Journey B: the invoice that drafts itself, the countdown, and every role's denials."""
import datetime
import threading

from django.db import connection
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from billing.models import Bill, BillLine
from foundation.models import AuditEntry

from .models import Container, Disbursement, Job
from .testing import BILLS, CONTAINERS, DISBURSEMENTS, JOBS, ClearanceWorld, money


class GateOutInvoiceTests(ClearanceWorld, TestCase):
    def setUp(self):
        self.build_world()
        self.job = self.make_job(assigned=self.staff['agent'], fee='125000.00')
        self.approved = [
            self.make_disbursement(self.job, '500000.00', 'customs_duty', 'CUS-1', approve_by=self.accounts_client),
            self.make_disbursement(self.job, '42000.50', 'port_charges', 'PRT-7', approve_by=self.accounts_client),
            self.make_disbursement(self.job, '18000.00', 'transport', 'TRN-3', approve_by=self.accounts_client),
        ]
        self.unapproved = self.make_disbursement(self.job, '9000.00', 'examination_labour', 'EXM-2')
        self.advance_to_released()

    def advance_to_released(self):
        self.advance(self.job, 'released')

    def gate_out(self, client=None):
        return self.move(client or self.coordinator_client, self.job, 'gate_out')

    def test_gate_out_drafts_exactly_one_bill_with_the_fee_and_the_approved_disbursements(self):
        response = self.gate_out()
        self.assertEqual(response.status_code, 200, response.content)
        self.job.refresh_from_db()
        bill = Bill.objects.get(pk=self.job.invoice_id)
        self.assertEqual(bill.state, 'draft')
        self.assertEqual(bill.customer, self.client_contact)
        lines = list(bill.lines.order_by('id'))
        self.assertEqual(len(lines), 4)
        self.assertFalse(lines[0].pass_through)
        self.assertTrue(all(line.pass_through for line in lines[1:]))
        # To the paisa, in Decimal: fee + the three approved disbursements, not the unapproved one.
        self.assertEqual(bill.amount_total, money('125000.00') + money('500000.00') + money('42000.50') + money('18000.00'))
        self.assertEqual(Bill.objects.count(), 1)
        self.assertEqual(self.job.state, 'gate_out')

    def test_the_approved_disbursements_become_billed_and_the_unapproved_one_is_flagged(self):
        self.gate_out()
        states = {d.pk: Disbursement.objects.get(pk=d.pk).state for d in [*self.approved, self.unapproved]}
        self.assertEqual([states[d.pk] for d in self.approved], ['billed'] * 3)
        self.assertEqual(states[self.unapproved.pk], 'recorded')
        self.job.refresh_from_db()
        notes = Bill.objects.get(pk=self.job.invoice_id).notes
        self.assertIn('Not yet billed', notes)
        self.assertIn('Examination labour', notes)
        self.assertNotIn('Customs duty', notes.split('Not yet billed')[1])

    def test_the_confirmation_names_what_will_happen(self):
        record = self.coordinator_client.get(f'{JOBS}{self.job.pk}/').json()
        sentence = record['workflow']['confirms']['gate_out']
        self.assertIn('draft invoice for Rs 6,85,000.50', sentence)
        self.assertIn('including 3 disbursements', sentence)
        self.assertIn('1 disbursement not yet approved will be left out', sentence)

    def test_a_second_gate_out_makes_no_second_bill(self):
        self.assertEqual(self.gate_out().status_code, 200)
        again = self.gate_out()
        self.assertEqual(again.status_code, 409)
        self.assertEqual(Bill.objects.count(), 1)
        self.assertEqual(Bill.objects.get().lines.count(), 4)

    def test_the_trail_says_the_automation_did_it(self):
        self.gate_out()
        self.job.refresh_from_db()
        sentence = f'Created by automation when {self.job.number} went to Gate-out'
        history = self.coordinator_client.get(f'{BILLS}{self.job.invoice_id}/history/').json()['results']
        self.assertIn(sentence, [entry['summary'] for entry in history])
        job_history = self.coordinator_client.get(f'{JOBS}{self.job.pk}/history/').json()['results']
        self.assertIn(sentence, [entry['summary'] for entry in job_history])
        line_entries = AuditEntry.objects.filter(summary=sentence)
        self.assertGreaterEqual(line_entries.count(), 6)  # the bill, four lines, the job's link

    def test_a_field_agent_cannot_trigger_gate_out(self):
        self.assertEqual(self.move(self.agent_client, self.job, 'gate_out').status_code, 403)
        schema = self.agent_client.get('/api/schema/clearance/job/').json()
        self.assertNotIn('gate_out', [t['name'] for t in schema['workflow']['transitions']])
        self.assertEqual(Bill.objects.count(), 0)

    def test_documentation_cannot_see_the_bill_or_the_money(self):
        self.gate_out()
        self.assertEqual(self.documentation_client.get(f'{BILLS}{self.job.invoice_id}/').status_code, 404)
        self.assertEqual(self.documentation_client.get(BILLS).status_code, 404)
        fields = self.documentation_client.get('/api/schema/clearance/job/').json()['fields']
        for hidden in ('service_fee', 'invoice', 'disbursements_total', 'billable_total'):
            self.assertNotIn(hidden, fields)
        values = self.documentation_client.get(f'{JOBS}{self.job.pk}/').json()['values']
        self.assertNotIn('service_fee', values)
        self.assertNotIn('invoice', values)

    def test_cancelling_after_gate_out_is_refused_while_the_invoice_is_posted(self):
        self.gate_out()
        self.job.refresh_from_db()
        posted = self.accounts_client.post(f'{BILLS}{self.job.invoice_id}/transitions/post/', format='json')
        self.assertEqual(posted.status_code, 200, posted.content)
        refused = self.move(self.coordinator_client, self.job, 'cancel')
        self.assertEqual(refused.status_code, 409)
        self.assertIn('posted', refused.json()['detail'])
        self.job.refresh_from_db()
        self.assertEqual(self.job.state, 'gate_out')

    def test_cancelling_with_only_a_draft_withdraws_it_and_frees_the_disbursements(self):
        self.gate_out()
        self.assertEqual(self.move(self.coordinator_client, self.job, 'cancel').status_code, 200)
        self.job.refresh_from_db()
        self.assertEqual(self.job.state, 'cancelled')
        self.assertEqual(Bill.objects.get(pk=self.job.invoice_id).state, 'cancelled')
        self.assertEqual(Disbursement.objects.get(pk=self.approved[0].pk).state, 'approved')

    def test_closing_needs_the_invoice_posted(self):
        self.gate_out()
        self.job.refresh_from_db()
        refused = self.move(self.coordinator_client, self.job, 'close')
        self.assertEqual(refused.status_code, 409)
        self.accounts_client.post(f'{BILLS}{self.job.invoice_id}/transitions/post/', format='json')
        self.assertEqual(self.move(self.coordinator_client, self.job, 'close').status_code, 200)

    def test_the_bill_is_a_normal_related_record_of_the_job(self):
        self.gate_out()
        record = self.coordinator_client.get(f'{JOBS}{self.job.pk}/').json()
        self.job.refresh_from_db()
        self.assertEqual(record['values']['invoice'], self.job.invoice_id)
        self.assertTrue(record['labels']['invoice'].startswith('BILL-'))


class ConcurrentGateOutTests(ClearanceWorld, TransactionTestCase):
    def setUp(self):
        self.build_world()
        self.job = self.make_job(fee='100000.00')
        self.make_disbursement(self.job, '1000.00', 'port_charges', 'P-1', approve_by=self.accounts_client)
        self.advance(self.job, 'released')

    def test_two_gate_outs_at_the_same_instant_make_one_bill(self):
        start = threading.Barrier(2)
        statuses, errors = [], []

        def work():
            try:
                client = APIClient()
                client.force_login(self.coordinator)
                start.wait()
                statuses.append(self.move(client, self.job, 'gate_out').status_code)
            except Exception as error:
                errors.append(error)
            finally:
                connection.close()

        threads = [threading.Thread(target=work) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
        self.assertEqual(sorted(statuses), [200, 409])
        self.assertEqual(Bill.objects.count(), 1)
        self.assertEqual(BillLine.objects.count(), 2)


class DisbursementRuleTests(ClearanceWorld, TestCase):
    def setUp(self):
        self.build_world()
        self.job = self.make_job(assigned=self.staff['agent'])

    def test_whoever_recorded_it_cannot_approve_it(self):
        recorded = self.make_disbursement(self.job, '5000.00', client=self.owner_client)
        refused = self.owner_client.post(f'{DISBURSEMENTS}{recorded.pk}/transitions/approve/', format='json')
        self.assertIn(refused.status_code, (403, 409))
        recorded.refresh_from_db()
        self.assertEqual(recorded.state, 'recorded')
        approved = self.accounts2_client.post(f'{DISBURSEMENTS}{recorded.pk}/transitions/approve/', format='json')
        self.assertEqual(approved.status_code, 200)

    def test_billed_cannot_be_set_by_a_user(self):
        recorded = self.make_disbursement(self.job, '5000.00')
        response = self.owner_client.patch(f'{DISBURSEMENTS}{recorded.pk}/', {'state': 'billed'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.owner_client.post(f'{DISBURSEMENTS}{recorded.pk}/transitions/billed/', format='json').status_code, 404)

    def test_an_approved_disbursement_is_locked(self):
        approved = self.make_disbursement(self.job, '5000.00', approve_by=self.accounts_client)
        response = self.owner_client.patch(f'{DISBURSEMENTS}{approved.pk}/', {'amount': '1.00'}, format='json')
        self.assertEqual(response.status_code, 409)

    def test_a_receipt_is_recorded_once_per_job_and_kind(self):
        self.make_disbursement(self.job, '1000.00', 'port_charges', 'R-1')
        clash = self.owner_client.post(
            DISBURSEMENTS, {'job': self.job.pk, 'kind': 'port_charges', 'amount': '1000.00', 'receipt_ref': 'R-1'}, format='json'
        )
        self.assertIn(clash.status_code, (400, 409))
        self.assertEqual(Disbursement.objects.filter(receipt_ref='R-1').count(), 1)
        other_kind = self.owner_client.post(
            DISBURSEMENTS, {'job': self.job.pk, 'kind': 'transport', 'amount': '1000.00', 'receipt_ref': 'R-1'}, format='json'
        )
        self.assertEqual(other_kind.status_code, 201)

    def test_only_accounts_and_the_owner_may_approve(self):
        recorded = self.make_disbursement(self.job, '5000.00')
        for client in (self.coordinator_client, self.documentation_client, self.agent_client):
            self.assertIn(
                client.post(f'{DISBURSEMENTS}{recorded.pk}/transitions/approve/', format='json').status_code, (403, 404)
            )
        recorded.refresh_from_db()
        self.assertEqual(recorded.state, 'recorded')


class ContainerCountdownTests(ClearanceWorld, TestCase):
    """The countdown depends on today, so each test fixes it and sets discharge dates around it."""

    def setUp(self):
        self.build_world(today=datetime.date(2026, 11, 4))
        self.job = self.make_job()

    def container(self, discharged, free_days=7, number='MSKU1234567', **values):
        response = self.make_container(self.job, number, discharged_on=discharged, free_days=free_days, **values)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()['values']

    def test_days_left_and_the_chip_at_every_boundary(self):
        today = datetime.date(2026, 11, 4)
        cases = [
            # discharged this many days ago (free days 7), expected days left, expected chip
            (0, 7, 'comfortable'),
            (1, 6, 'comfortable'),
            (2, 5, 'soon'),
            (4, 3, 'soon'),
            (5, 2, 'urgent'),
            (7, 0, 'urgent'),   # the last free day: 0 days left
            (8, -1, 'accruing'),  # one day past
        ]
        for index, (ago, left, chip) in enumerate(cases):
            discharged = (today - datetime.timedelta(days=ago)).isoformat()
            values = self.container(discharged, number=f'MSKU{1000000 + index}')
            self.assertEqual(values['days_left'], left, ago)
            self.assertEqual(values['deadline_status'], chip, ago)

    def test_free_until_is_discharge_plus_free_days(self):
        values = self.container('2026-11-01', free_days=10)
        self.assertEqual(values['free_until'], '2026-11-11')

    def test_demurrage_is_zero_until_free_time_runs_out_then_days_past_times_rate(self):
        on_the_day = self.container('2026-10-28', demurrage_rate_per_day='15000.00', number='MSKU2000001')  # 7 ago
        self.assertEqual(on_the_day['demurrage_accrued'], '0.00')
        three_past = self.container('2026-10-25', demurrage_rate_per_day='15000.00', number='MSKU2000002')  # 10 ago
        self.assertEqual(three_past['demurrage_accrued'], '45000.00')

    def test_it_stops_counting_once_the_container_has_gone_out(self):
        values = self.container('2026-10-20', demurrage_rate_per_day='10000.00', gate_out_on='2026-10-30', number='MSKU3000001')
        self.assertIsNone(values['days_left'])
        self.assertEqual(values['deadline_status'], 'cleared')
        # Final: 10 days inside, 7 free, 3 days of demurrage, however long ago that was.
        self.assertEqual(values['demurrage_accrued'], '30000.00')

    def test_a_job_shows_its_worst_container(self):
        self.container('2026-11-03', number='MSKU4000001')  # comfortable
        self.container('2026-10-25', number='MSKU4000002')  # accruing
        record = self.owner_client.get(f'{JOBS}{self.job.pk}/').json()['values']
        self.assertEqual(record['demurrage_status'], 'accruing')
        self.assertEqual(record['containers_count'], 2)
        self.assertEqual(record['demurrage_next_deadline'], '2026-11-01')

    def test_a_job_with_no_containers_says_so(self):
        self.assertEqual(self.owner_client.get(f'{JOBS}{self.job.pk}/').json()['values']['demurrage_status'], 'none')

    def test_a_container_number_is_validated(self):
        for bad in ('MSKU123456', 'msku1234567', '1234MSKU567', 'MSK1234567'):
            self.assertEqual(self.make_container(self.job, bad).status_code, 400, bad)
        self.assertEqual(self.make_container(self.job, 'MSKU7654321').status_code, 201)
        self.assertEqual(Container.objects.get(number='MSKU7654321').job, self.job)


class RoleDenialTests(ClearanceWorld, TestCase):
    def setUp(self):
        self.build_world()
        self.mine = self.make_job(assigned=self.staff['agent'])
        self.theirs = self.make_job(assigned=self.staff['agent2'])
        self.make_container(self.mine, 'MSKU1111111')
        self.make_container(self.theirs, 'MSKU2222222')
        self.make_disbursement(self.mine, '1000.00', 'transport', 'A-1', client=self.agent_client)
        self.make_disbursement(self.theirs, '2000.00', 'transport', 'B-1', client=self.agent2_client)

    # ---- Field agent

    def test_a_field_agent_sees_only_their_own_jobs_and_404s_on_anothers(self):
        listing = self.agent_client.get(JOBS).json()
        self.assertEqual([row['id'] for row in listing['results']], [self.mine.pk])
        self.assertEqual(self.agent_client.get(f'{JOBS}{self.mine.pk}/').status_code, 200)
        self.assertEqual(self.agent_client.get(f'{JOBS}{self.theirs.pk}/').status_code, 404)

    def test_a_field_agent_sees_only_their_own_containers_and_disbursements(self):
        containers = self.agent_client.get(CONTAINERS).json()['results']
        self.assertEqual([row['display'] for row in containers], ['MSKU1111111'])
        disbursements = self.agent_client.get(DISBURSEMENTS).json()['results']
        self.assertEqual(len(disbursements), 1)
        self.assertEqual(disbursements[0]['values']['amount'], '1000.00')

    def test_a_field_agent_has_no_money_fields_on_a_job_or_container(self):
        job_fields = self.agent_client.get('/api/schema/clearance/job/').json()['fields']
        for hidden in ('service_fee', 'invoice', 'disbursements_total', 'billable_total'):
            self.assertNotIn(hidden, job_fields)
        container_fields = self.agent_client.get('/api/schema/clearance/container/').json()['fields']
        self.assertNotIn('demurrage_rate_per_day', container_fields)
        self.assertNotIn('demurrage_accrued', container_fields)
        self.assertIn('days_left', container_fields)  # the countdown is theirs to watch
        record = self.agent_client.get(f'{JOBS}{self.mine.pk}/').json()['values']
        self.assertNotIn('service_fee', record)

    def test_a_field_agent_cannot_add_a_container_to_someone_elses_job(self):
        response = self.make_container(self.theirs, 'MSKU3333333', client=self.agent_client)
        self.assertIn(response.status_code, (400, 403, 404))
        self.assertFalse(Container.objects.filter(number='MSKU3333333').exists())
        self.assertEqual(self.make_container(self.mine, 'MSKU4444444', client=self.agent_client).status_code, 201)

    def test_a_field_agent_cannot_record_a_disbursement_on_someone_elses_job(self):
        response = self.agent_client.post(
            DISBURSEMENTS, {'job': self.theirs.pk, 'kind': 'transport', 'amount': '10.00'}, format='json'
        )
        self.assertIn(response.status_code, (400, 403, 404))
        self.assertEqual(Disbursement.objects.filter(job=self.theirs).count(), 1)

    def test_a_field_agent_moves_duty_paid_to_examined_to_released_and_no_further(self):
        for name in ('documents_in', 'file_gd', 'assess', 'pay_duty'):
            self.assertEqual(self.move(self.owner_client, self.mine, name).status_code, 200)
        self.assertEqual(self.move(self.agent_client, self.mine, 'examine').status_code, 200)
        self.assertEqual(self.move(self.agent_client, self.mine, 'release').status_code, 200)
        self.assertEqual(self.move(self.agent_client, self.mine, 'gate_out').status_code, 403)
        self.assertEqual(self.move(self.agent_client, self.theirs, 'documents_in').status_code, 404)
        # Early stages are not theirs.
        for name in ('documents_in', 'file_gd', 'assess', 'pay_duty', 'close', 'cancel'):
            self.assertIn(self.move(self.agent_client, self.theirs, name).status_code, (403, 404), name)

    def test_a_field_agent_can_skip_examination_on_a_green_channel_job(self):
        for name in ('documents_in', 'file_gd', 'assess', 'pay_duty'):
            self.move(self.owner_client, self.mine, name)
        self.assertEqual(self.move(self.agent_client, self.mine, 'release').status_code, 200)

    def test_a_field_agent_cannot_change_a_job_or_see_it_in_a_bulk_way(self):
        self.assertEqual(self.agent_client.patch(f'{JOBS}{self.mine.pk}/', {'notes': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.agent_client.post(JOBS, {'client': self.client_contact.pk}, format='json').status_code, 403)

    def test_a_field_agent_sees_only_the_clients_of_their_jobs(self):
        other = self.client_contact.__class__.objects.create(name='Unrelated Ltd (demo)', type='company', is_customer=True)
        names = [row['display'] for row in self.agent_client.get('/api/data/core/contact/').json()['results']]
        self.assertEqual(names, ['Indus Textile Mills (demo)'])
        self.assertEqual(self.agent_client.get(f'/api/data/core/contact/{other.pk}/').status_code, 404)

    # ---- Documentation

    def test_documentation_moves_jobs_only_up_to_assessed(self):
        self.assertEqual(self.move(self.documentation_client, self.mine, 'documents_in').status_code, 200)
        self.assertEqual(self.move(self.documentation_client, self.mine, 'file_gd').status_code, 200)
        self.assertEqual(self.move(self.documentation_client, self.mine, 'assess').status_code, 200)
        for name in ('pay_duty', 'examine', 'release', 'gate_out', 'close', 'cancel'):
            self.assertEqual(self.move(self.documentation_client, self.mine, name).status_code, 403, name)

    def test_documentation_sees_no_amounts_anywhere(self):
        fields = self.documentation_client.get('/api/schema/clearance/disbursement/').json()['fields']
        self.assertNotIn('amount', fields)
        rows = self.documentation_client.get(DISBURSEMENTS).json()['results']
        self.assertTrue(all('amount' not in row['values'] for row in rows))
        container_fields = self.documentation_client.get('/api/schema/clearance/container/').json()['fields']
        self.assertNotIn('demurrage_rate_per_day', container_fields)
        self.assertEqual(self.documentation_client.get(BILLS).status_code, 404)

    # ---- Coordinator

    def test_a_coordinator_sees_every_job_and_the_fees_but_cannot_approve_or_post(self):
        self.assertEqual(self.coordinator_client.get(JOBS).json()['count'], 2)
        fields = self.coordinator_client.get('/api/schema/clearance/job/').json()['fields']
        self.assertIn('service_fee', fields)
        disbursement = Disbursement.objects.filter(job=self.mine).first()
        self.assertIn(
            self.coordinator_client.post(f'{DISBURSEMENTS}{disbursement.pk}/transitions/approve/', format='json').status_code,
            (403, 404),
        )
        bill = Bill.objects.create(customer=self.client_contact)
        self.assertEqual(self.coordinator_client.post(f'{BILLS}{bill.pk}/transitions/post/', format='json').status_code, 403)

    # ---- Accounts

    def test_accounts_reads_job_stages_but_cannot_move_them(self):
        self.assertEqual(self.accounts_client.get(JOBS).json()['count'], 2)
        for name in ('documents_in', 'gate_out', 'cancel', 'release'):
            self.assertEqual(self.move(self.accounts_client, self.mine, name).status_code, 403, name)
        self.assertEqual(self.accounts_client.patch(f'{JOBS}{self.mine.pk}/', {'notes': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.accounts_client.get(BILLS).status_code, 200)

    # ---- every role is only the journey's

    def test_every_clearance_role_is_denied_the_water_models(self):
        for client in (self.coordinator_client, self.documentation_client, self.agent_client, self.accounts_client):
            for url in ('/api/data/water/recoverycase/', '/api/data/water/connection/', '/api/data/water/tariff/'):
                self.assertEqual(client.get(url).status_code, 404, url)
            registry = client.get('/api/registry/').json()
            labels = {app['app_label'] for app in registry['apps']}
            self.assertIn('clearance', labels)
            self.assertNotIn('water', labels)


class JourneyIsolationTests(ClearanceWorld, TestCase):
    """The clearing agency's deployment has no water models at all, not even for its Owner."""

    def setUp(self):
        self.build_world()

    def test_an_owner_in_the_clearance_journey_sees_no_water_or_recovery_items(self):
        from django.test import override_settings

        with override_settings(CLICKER_JOURNEY='clearance'):
            registry = self.owner_client.get('/api/registry/').json()['apps']
            self.assertEqual({app['app_label'] for app in registry} & {'water'}, set())
            labels = {model['label'] for app in registry for model in app['models']}
            self.assertNotIn('Recovery cases', labels)
            self.assertNotIn('Tariffs', labels)
            self.assertEqual(self.owner_client.get('/api/data/water/recoverycase/').status_code, 404)
            self.assertEqual(self.owner_client.get('/api/schema/water/recoverycase/').status_code, 404)

    def test_in_the_water_journey_the_clearance_models_do_not_exist(self):
        from django.test import override_settings

        manager_like = self.owner_client
        with override_settings(CLICKER_JOURNEY='water'):
            self.assertEqual(manager_like.get('/api/data/clearance/job/').status_code, 404)
            apps = {app['app_label'] for app in manager_like.get('/api/registry/').json()['apps']}
            self.assertNotIn('clearance', apps)
