"""
S-5's receivables rules, through the API as the roles that use them. Each
test says one thing and proves it: a number that must be, or a refusal that
must happen.

Today is pinned to 3 Nov 2026 (Karachi).
"""
import datetime
import threading
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db import connection
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings

from core.models import Contact
from foundation.models import AuditEntry
from schema.engine import build_schema

from .models import Adjustment, Bill, BillLine, Payment, PaymentAllocation
from .testing import ADJUSTMENTS, BILLS, LINES, PAYMENTS, BillingWorld, money


def audit_for(obj):
    return AuditEntry.objects.filter(
        content_type=ContentType.objects.get_for_model(type(obj)), record_id=str(obj.pk)
    ).order_by('timestamp', 'id')


class BillTests(BillingWorld, TestCase):
    def setUp(self):
        self.build_world()
        self.acme = self.customer(terms=45)

    def test_the_due_date_follows_the_customers_payment_terms(self):
        bill = self.make_bill(self.acme, issue='2026-08-01', post=False)
        self.assertEqual(bill.due_date, datetime.date(2026, 9, 15))

    def test_a_due_date_typed_in_is_kept(self):
        response = self.officer_client.post(
            BILLS, {'customer': self.acme.pk, 'issue_date': '2026-08-01', 'due_date': '2026-08-10'}, format='json'
        )
        self.assertEqual(response.json()['values']['due_date'], '2026-08-10')

    def test_the_total_follows_the_lines_while_a_draft_and_rounds_each_line(self):
        bill = self.make_bill(self.acme, amount='100.10', post=False)
        self.officer_client.post(
            LINES, {'bill': bill.pk, 'description': 'Sewerage', 'quantity': '2.500', 'unit_price': '33.33'}, format='json'
        )
        bill.refresh_from_db()
        # 100.10 + round(2.5 × 33.33 = 83.325 → 83.33) = 183.43
        self.assertEqual(bill.amount_total, money('183.43'))
        line = BillLine.objects.filter(bill=bill).first()
        self.officer_client.patch(f'{LINES}{line.pk}/', {'unit_price': '200.00'}, format='json')
        bill.refresh_from_db()
        self.assertEqual(bill.amount_total, money('283.33'))
        # The total's changes are in the bill's own trail.
        totals = [e.changes['amount_total']['after'] for e in audit_for(bill) if 'amount_total' in e.changes]
        self.assertEqual(totals[-1], '283.33')

    def test_a_posted_bill_cannot_be_edited_and_its_lines_cannot_change(self):
        bill = self.make_bill(self.acme)
        response = self.officer_client.patch(f'{BILLS}{bill.pk}/', {'due_date': '2026-12-31'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertIn('Posted', response.json()['detail'])
        line = self.officer_client.post(
            LINES, {'bill': bill.pk, 'description': 'Late', 'quantity': '1', 'unit_price': '5.00'}, format='json'
        )
        self.assertEqual(line.status_code, 400)

    def test_a_bill_needs_a_line_before_it_can_be_posted(self):
        bill = self.officer_client.post(BILLS, {'customer': self.acme.pk}, format='json').json()
        response = self.officer_client.post(f'{BILLS}{bill["id"]}/transitions/post/', format='json')
        self.assertEqual(response.status_code, 409)
        self.assertIn('at least one line', response.json()['detail'])

    def test_only_a_customer_can_be_billed(self):
        supplier = Contact.objects.create(name='Only a vendor', type='company', is_vendor=True)
        response = self.officer_client.post(BILLS, {'customer': supplier.pk}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_paid_amounts_are_never_client_writable(self):
        bill = self.make_bill(self.acme, post=False)
        for field in ('amount_paid', 'amount_adjusted', 'amount_total', 'state'):
            response = self.manager_client.patch(f'{BILLS}{bill.pk}/', {field: '1.00'}, format='json')
            self.assertEqual(response.status_code, 400, field)

    def test_only_a_manager_cancels_and_only_with_nothing_applied(self):
        bill = self.make_bill(self.acme)
        denied = self.transition(self.officer_client, BILLS, bill, 'cancel')
        self.assertEqual(denied.status_code, 403)
        self.make_payment(self.acme, '400.00', 'REF-1')
        refused = self.transition(self.manager_client, BILLS, bill, 'cancel')
        self.assertEqual(refused.status_code, 409)
        self.assertIn('can’t be cancelled', refused.json()['detail'])
        other = self.make_bill(self.acme, issue='2026-09-01')
        self.assertEqual(self.transition(self.manager_client, BILLS, other, 'cancel').status_code, 200)

    def test_status_and_aging_are_computed_in_karachi_time(self):
        late = self.make_bill(self.acme, issue='2026-03-01')  # due 15 Apr: 202 days late on 3 Nov
        fresh = self.make_bill(self.acme, issue='2026-10-20')  # due 4 Dec: not yet due
        rows = {
            r['id']: r['values']
            for r in self.manager_client.get(BILLS, {'limit': 50}).json()['results']
        }
        self.assertEqual(rows[late.pk]['payment_status'], 'overdue')
        self.assertEqual(rows[late.pk]['days_overdue'], 202)
        self.assertEqual(rows[fresh.pk]['payment_status'], 'not_paid')
        self.assertEqual(rows[fresh.pk]['days_overdue'], -31)
        groups = self.manager_client.get(BILLS + 'aggregate/', {'group_by': 'days_overdue', 'filter': 'state:in:posted'}).json()['groups']
        self.assertEqual([(g['label'], g['count']) for g in groups], [('Not yet due', 1), ('Over 180 days', 1)])


class AllocationTests(BillingWorld, TestCase):
    def setUp(self):
        self.build_world()
        self.acme = self.customer()
        # Due 31 Jul, 31 Aug, 1 Oct: three bills, oldest first.
        self.a = self.make_bill(self.acme, '1000.00', issue='2026-07-01')
        self.b = self.make_bill(self.acme, '2000.00', issue='2026-08-01')
        self.c = self.make_bill(self.acme, '500.00', issue='2026-09-01')

    def paid(self, *bills):
        return [Bill.objects.get(pk=b.pk).amount_paid for b in bills]

    def test_a_payment_is_allocated_oldest_first(self):
        payment = self.make_payment(self.acme, '2800.00', 'TX-1')
        self.assertEqual(self.paid(self.a, self.b, self.c), [money('1000.00'), money('1800.00'), money('0.00')])
        allocations = list(PaymentAllocation.objects.filter(payment=payment).order_by('bill__due_date'))
        self.assertEqual([(x.bill_id, x.amount) for x in allocations], [(self.a.pk, money('1000.00')), (self.b.pk, money('1800.00'))])

    def test_the_remainder_is_the_customers_advance_and_goes_to_their_next_bill(self):
        self.make_payment(self.acme, '2800.00', 'TX-1')
        second = self.make_payment(self.acme, '1000.00', 'TX-2')
        # 200 finishes bill B, 500 pays C, 300 is left.
        self.assertEqual(self.paid(self.a, self.b, self.c), [money('1000.00'), money('2000.00'), money('500.00')])
        row = self.manager_client.get(f'{PAYMENTS}{second.pk}/').json()['values']
        self.assertEqual((row['allocated'], row['advance']), ('700.00', '300.00'))
        contact = self.manager_client.get(f'/api/data/core/contact/{self.acme.pk}/').json()['values']
        self.assertEqual(contact['advance'], '300.00')
        self.assertEqual(contact['outstanding'], '0.00')
        # A new bill takes the advance the moment it is posted.
        new = self.make_bill(self.acme, '1000.00', issue='2026-10-01')
        new.refresh_from_db()
        self.assertEqual(new.amount_paid, money('300.00'))
        self.assertEqual(self.manager_client.get(f'/api/data/core/contact/{self.acme.pk}/').json()['values']['advance'], '0.00')

    def test_the_bills_trail_names_the_payment(self):
        payment = self.make_payment(self.acme, '400.00', 'TX-1')
        summaries = [e.summary for e in audit_for(self.a) if e.summary]
        self.assertEqual(summaries, [f'Payment {payment.number} allocated {{money:400.00}}'])

    def test_cancelling_a_payment_reverses_its_allocations_and_frees_its_reference(self):
        payment = self.make_payment(self.acme, '2800.00', 'TX-1')
        denied = self.transition(self.cashier_client, PAYMENTS, payment, 'cancel')
        self.assertEqual(denied.status_code, 403)  # a cashier posts; only a Manager cancels
        self.assertEqual(self.transition(self.manager_client, PAYMENTS, payment, 'cancel').status_code, 200)
        self.assertEqual(self.paid(self.a, self.b, self.c), [money('0.00')] * 3)
        self.assertFalse(PaymentAllocation.objects.filter(payment=payment, reversed=False).exists())
        self.make_payment(self.acme, '100.00', 'TX-1')  # the reference is free again

    def test_a_duplicate_reference_is_refused_for_the_same_method_only(self):
        self.make_payment(self.acme, '100.00', 'TX-1', post=False)
        duplicate = self.cashier_client.post(
            PAYMENTS, {'customer': self.acme.pk, 'amount': '100.00', 'method': 'bank_transfer', 'reference': 'TX-1'},
            format='json',
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn('reference', duplicate.json())
        other_method = self.cashier_client.post(
            PAYMENTS, {'customer': self.acme.pk, 'amount': '100.00', 'method': 'cheque', 'reference': 'TX-1'}, format='json'
        )
        self.assertEqual(other_method.status_code, 201)

    def test_a_bank_payment_needs_its_reference_and_cash_does_not(self):
        bank = self.cashier_client.post(
            PAYMENTS, {'customer': self.acme.pk, 'amount': '100.00', 'method': 'cheque'}, format='json'
        )
        self.assertEqual(bank.status_code, 400)
        cash = self.cashier_client.post(
            PAYMENTS, {'customer': self.acme.pk, 'amount': '100.00', 'method': 'cash'}, format='json'
        )
        self.assertEqual(cash.status_code, 201)

    def test_a_posted_payment_is_locked(self):
        payment = self.make_payment(self.acme, '100.00', 'TX-1')
        response = self.cashier_client.patch(f'{PAYMENTS}{payment.pk}/', {'amount': '999.00'}, format='json')
        self.assertEqual(response.status_code, 409)

    def test_allocations_cannot_be_written_through_the_api_by_anyone(self):
        payment = self.make_payment(self.acme, '100.00', 'TX-1')
        url = '/api/data/billing/paymentallocation/'
        body = {'payment': payment.pk, 'bill': self.c.pk, 'amount': '5.00'}
        for client in (self.manager_client, self.cashier_client):
            self.assertEqual(client.post(url, body, format='json').status_code, 403)
        schema = self.manager_client.get('/api/schema/billing/paymentallocation/').json()
        self.assertFalse(schema['actions']['create'] or schema['actions']['update'])


class ConcurrentPaymentTests(BillingWorld, TransactionTestCase):
    """Two cashiers posting at the same instant must not allocate more than a bill owes."""

    def setUp(self):
        self.build_world()
        self.acme = self.customer()
        self.bill = self.make_bill(self.acme, '1000.00', issue='2026-07-01')
        self.payments = [
            self.make_payment(self.acme, '800.00', f'RACE-{n}', post=False) for n in range(2)
        ]

    def test_two_payments_posted_together_never_over_allocate_a_bill(self):
        start = threading.Barrier(2)
        statuses, errors = [], []

        def work(payment):
            try:
                start.wait()
                client = self.make_cashier_client()
                statuses.append(client.post(f'{PAYMENTS}{payment.pk}/transitions/post/', format='json').status_code)
            except Exception as error:  # a thread can't fail the test itself
                errors.append(error)
            finally:
                connection.close()

        threads = [threading.Thread(target=work, args=(p,)) for p in self.payments]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(errors, [])
        self.assertEqual(sorted(statuses), [200, 200])
        self.bill.refresh_from_db()
        self.assertEqual(self.bill.amount_paid, money('1000.00'))
        allocated = sum(a.amount for a in PaymentAllocation.objects.filter(reversed=False))
        self.assertEqual(allocated, money('1000.00'))  # 800 + 200, never 1,600
        advances = sorted(
            self.manager_client.get(f'{PAYMENTS}{p.pk}/').json()['values']['advance'] for p in self.payments
        )
        self.assertEqual(advances, ['0.00', '600.00'])

    def make_cashier_client(self):
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_login(self.cashier)
        return client


class AdjustmentTests(BillingWorld, TestCase):
    def setUp(self):
        self.build_world()
        self.acme = self.customer()
        self.bill = self.make_bill(self.acme, '1000.00', issue='2026-07-01')

    def test_an_approved_adjustment_reduces_the_bills_balance(self):
        adjustment = self.make_adjustment(self.bill, '300.00')
        self.assertEqual(self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve').status_code, 200)
        self.bill.refresh_from_db()
        self.assertEqual((self.bill.amount_adjusted, self.bill.balance_value), (money('300.00'), money('700.00')))
        row = self.manager_client.get(f'{BILLS}{self.bill.pk}/').json()['values']
        self.assertEqual((row['balance'], row['payment_status']), ('700.00', 'overdue'))
        summaries = [e.summary for e in audit_for(self.bill) if e.summary]
        self.assertEqual(summaries, [f'Adjustment {adjustment.number} reduced the balance by {{money:300.00}}'])

    def test_a_rejected_adjustment_changes_nothing(self):
        adjustment = self.make_adjustment(self.bill, '300.00')
        self.assertEqual(self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'reject').status_code, 200)
        self.bill.refresh_from_db()
        self.assertEqual(self.bill.amount_adjusted, money('0.00'))

    def test_the_requester_cannot_approve_their_own_adjustment_even_as_a_manager(self):
        adjustment = self.make_adjustment(self.bill, '300.00', client=self.manager_client)
        response = self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve')
        self.assertEqual(response.status_code, 403)
        self.assertIn('requester', response.json()['detail'])
        self.bill.refresh_from_db()
        self.assertEqual(self.bill.amount_adjusted, money('0.00'))
        status = self.manager_client.get(f'{ADJUSTMENTS}{adjustment.pk}/').json()['workflow']
        self.assertEqual(status['available'], [])
        self.assertIn('You’re its requester', status['waiting'])
        self.assertEqual(self.transition(self.other_manager_client, ADJUSTMENTS, adjustment, 'approve').status_code, 200)

    def test_a_billing_officer_can_request_but_never_approve(self):
        adjustment = self.make_adjustment(self.bill, '300.00')
        self.assertEqual(self.transition(self.officer_client, ADJUSTMENTS, adjustment, 'approve').status_code, 403)
        schema = build_schema(Adjustment, self.officer)
        self.assertEqual([t['name'] for t in schema['workflow']['transitions']], ['request'])

    def test_a_reduction_cannot_exceed_the_balance(self):
        response = self.officer_client.post(
            ADJUSTMENTS, {'bill': self.bill.pk, 'kind': 'credit', 'amount': '1000.01', 'reason': 'Too much'}, format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('balance', response.json()['amount'][0])

    def test_a_reason_is_required(self):
        response = self.officer_client.post(
            ADJUSTMENTS, {'bill': self.bill.pk, 'kind': 'credit', 'amount': '10.00', 'reason': ''}, format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('reason', response.json())

    def test_a_balance_that_fell_below_the_request_blocks_approval(self):
        adjustment = self.make_adjustment(self.bill, '600.00')
        self.make_payment(self.acme, '700.00', 'TX-1')  # the bill now owes 300
        response = self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve')
        self.assertEqual(response.status_code, 409)
        self.assertIn('balance is now', response.json()['detail'])

    def test_the_approver_sees_the_context_in_the_schema_not_a_bespoke_screen(self):
        adjustment = self.make_adjustment(self.bill, '300.00')
        body = self.other_manager_client.get(f'{ADJUSTMENTS}{adjustment.pk}/').json()
        values = body['values']
        self.assertEqual(
            (values['balance_before'], values['balance_after'], values['customer_outstanding']),
            ('1000.00', '700.00', '1000.00'),
        )
        self.assertEqual(values['bill_days_overdue'], 95)
        self.assertEqual(body['labels']['bill'], f'{self.bill.number} · Federal Steel Corporation (demo)')
        self.assertEqual(body['labels']['customer'], 'Federal Steel Corporation (demo)')
        # Who asked, by name, never by login.
        self.assertEqual(body['labels']['requested_by'], 'Bilal Ahmed')
        fields = self.other_manager_client.get('/api/schema/billing/adjustment/').json()
        self.assertTrue(fields['fields']['requested_by']['person'])
        groups = {g['label']: g['fields'] for g in fields['groups']}
        self.assertIn('balance_after', groups['What it does'])

    @override_settings(CLICKER_REDUCTION_SECOND_APPROVER_THRESHOLD=Decimal('500.00'))
    def test_above_the_threshold_a_second_manager_must_approve(self):
        adjustment = self.make_adjustment(self.bill, '600.00')
        single = self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve')
        self.assertEqual(single.status_code, 409)
        self.assertIn('two', single.json()['detail'])
        first = self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve_first')
        self.assertEqual(first.status_code, 200)
        adjustment.refresh_from_db()
        self.assertEqual(adjustment.state, 'approved_once')
        self.bill.refresh_from_db()
        self.assertEqual(self.bill.amount_adjusted, money('0.00'))
        again = self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve_second')
        self.assertEqual(again.status_code, 403)  # the first approver can't be the second
        done = self.transition(self.other_manager_client, ADJUSTMENTS, adjustment, 'approve_second')
        self.assertEqual(done.status_code, 200)
        self.bill.refresh_from_db()
        self.assertEqual(self.bill.amount_adjusted, money('600.00'))

    @override_settings(CLICKER_REDUCTION_SECOND_APPROVER_THRESHOLD=Decimal('500.00'))
    def test_below_the_threshold_one_approver_is_enough(self):
        adjustment = self.make_adjustment(self.bill, '400.00')
        self.assertEqual(self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve_first').status_code, 409)
        self.assertEqual(self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve').status_code, 200)


class CrossTheLimitTests(BillingWorld, TestCase):
    """The shipped limit (Rs 1 crore): above it one Manager's yes is not enough."""

    def setUp(self):
        self.build_world()
        self.acme = self.customer()
        self.bill = self.make_bill(self.acme, '30000000.00', issue='2026-07-01')  # Rs 3 crore

    def test_the_limit_is_one_crore(self):
        from django.conf import settings

        self.assertEqual(settings.CLICKER_REDUCTION_SECOND_APPROVER_THRESHOLD, Decimal('10000000.00'))

    def test_one_managers_approval_above_the_limit_waits_for_a_second(self):
        adjustment = self.make_adjustment(self.bill, '15000000.00')  # Rs 1.5 crore
        # The single-step approval is refused above the limit...
        self.assertEqual(self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve').status_code, 409)
        # ...the first approval is recorded and nothing is reduced yet.
        self.assertEqual(self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve_first').status_code, 200)
        adjustment.refresh_from_db()
        self.assertEqual(adjustment.state, 'approved_once')
        self.assertEqual(adjustment.first_approver, self.manager)
        self.bill.refresh_from_db()
        self.assertEqual(self.bill.amount_adjusted, money('0.00'))
        # The same Manager can't be the second, and the requester never can.
        self.assertIn(self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve_second').status_code, (403, 409))
        self.assertIn(self.transition(self.officer_client, ADJUSTMENTS, adjustment, 'approve_second').status_code, (403, 404))
        adjustment.refresh_from_db()
        self.assertEqual(adjustment.state, 'approved_once')
        # A different Manager completes it.
        self.assertEqual(self.transition(self.other_manager_client, ADJUSTMENTS, adjustment, 'approve_second').status_code, 200)
        self.bill.refresh_from_db()
        self.assertEqual(self.bill.amount_adjusted, money('15000000.00'))

    def test_the_requester_can_never_approve(self):
        adjustment = self.make_adjustment(self.bill, '15000000.00', client=self.manager_client)
        for name in ('approve', 'approve_first'):
            self.assertIn(self.transition(self.manager_client, ADJUSTMENTS, adjustment, name).status_code, (403, 409), name)
        adjustment.refresh_from_db()
        self.assertEqual(adjustment.state, 'requested')

    def test_at_or_below_the_limit_one_approval_is_enough(self):
        adjustment = self.make_adjustment(self.bill, '10000000.00')  # exactly Rs 1 crore
        self.assertEqual(self.transition(self.manager_client, ADJUSTMENTS, adjustment, 'approve').status_code, 200)


class RoleTests(BillingWorld, TestCase):
    def setUp(self):
        self.build_world()
        self.acme = self.customer()
        self.bill = self.make_bill(self.acme, '1000.00', issue='2026-07-01')

    def test_a_cashier_cannot_create_bills_or_adjustments(self):
        self.assertEqual(self.cashier_client.post(BILLS, {'customer': self.acme.pk}, format='json').status_code, 403)
        body = {'bill': self.bill.pk, 'kind': 'credit', 'amount': '10.00', 'reason': 'x'}
        self.assertEqual(self.cashier_client.post(ADJUSTMENTS, body, format='json').status_code, 404)

    def test_a_billing_officer_cannot_post_a_payment(self):
        payment = self.make_payment(self.acme, '100.00', 'TX-1', post=False)
        self.assertEqual(self.transition(self.officer_client, PAYMENTS, payment, 'post').status_code, 403)

    def test_the_auditor_reads_everything_including_the_trail_and_changes_nothing(self):
        for url in (BILLS, PAYMENTS, ADJUSTMENTS, '/api/data/core/contact/'):
            self.assertEqual(self.auditor_client.get(url).status_code, 200, url)
        self.assertEqual(self.auditor_client.get(f'{BILLS}{self.bill.pk}/history/').status_code, 200)
        self.assertEqual(self.auditor_client.patch(f'/api/data/core/contact/{self.acme.pk}/', {'city': 'X'}, format='json').status_code, 403)
        self.assertEqual(self.auditor_client.post(BILLS, {'customer': self.acme.pk}, format='json').status_code, 403)
        for model in ('bill', 'payment', 'adjustment'):
            actions = self.auditor_client.get(f'/api/schema/billing/{model}/').json()['actions']
            self.assertFalse(actions['create'] or actions['update'], model)

    def test_history_names_people_and_carries_summaries_and_link_names(self):
        self.make_payment(self.acme, '400.00', 'TX-1')
        history = self.manager_client.get(f'{BILLS}{self.bill.pk}/history/').json()['results']
        self.assertTrue(all(e['actor'] and e['actor']['display_name'] != e['actor'].get('username') for e in history))
        self.assertIn('Imran Siddiqui', {e['actor']['display_name'] for e in history})
        created = history[-1]['changes']['customer']
        self.assertEqual(created['after_label'], 'Federal Steel Corporation (demo)')

    def test_a_customers_form_is_their_statement(self):
        self.make_payment(self.acme, '400.00', 'TX-1')
        self.make_adjustment(self.bill, '100.00')
        values = self.manager_client.get(f'/api/data/core/contact/{self.acme.pk}/').json()['values']
        self.assertEqual((values['outstanding'], values['oldest_overdue_days']), ('600.00', 95))
        labels = [rl['label'] for rl in build_schema(Contact, self.manager)['related_lists']]
        self.assertEqual(labels[:4], ['Bills', 'Payments', 'Adjustments', 'Recovery cases'])
        owing = self.manager_client.get('/api/data/core/contact/', {'filter': 'outstanding:gte:0.01'}).json()
        self.assertEqual(owing['count'], 1)
        # Not for someone who can't view bills.
        contact_only = build_schema(Contact, self.recovery)
        self.assertIn('outstanding', contact_only['fields'])
        self.assertNotIn('outstanding', build_schema(Contact, self.manager_client and self._clerk())['fields'])

    def _clerk(self):
        from foundation.test_roles import member_of

        return member_of('Clerk', 'clerk')[0]


class MoneyTextTests(SimpleTestCase):
    """Sentences the server writes group digits the way the organisation counts."""

    def test_lakh_grouping(self):
        from foundation.money import format_money

        self.assertEqual(format_money('0'), 'Rs 0.00')
        self.assertEqual(format_money('999.5'), 'Rs 999.50')
        self.assertEqual(format_money('1000'), 'Rs 1,000.00')
        self.assertEqual(format_money('420000'), 'Rs 4,20,000.00')
        self.assertEqual(format_money('1248500.05'), 'Rs 12,48,500.05')
        self.assertEqual(format_money('-31332000000'), '−Rs 31,33,20,00,000.00')

    def test_western_grouping_when_configured(self):
        from foundation.money import format_money

        with self.settings(CLICKER_CURRENCY={'code': 'USD', 'symbol': '$', 'decimal_places': 2, 'grouping': 'western'}):
            self.assertEqual(format_money('1248500'), '$ 1,248,500.00')


class CancelOfferedOnlyWhenPossibleTests(BillingWorld, TestCase):
    """The record's form hides Cancel when payments are applied; the API still refuses it."""

    def setUp(self):
        self.build_world()
        self.acme = self.customer()
        self.bill = self.make_bill(self.acme, '1000.00', issue='2026-08-01')

    def offered(self, client):
        return client.get(f'{BILLS}{self.bill.pk}/').json()['workflow']

    def test_an_unpaid_posted_bill_offers_cancel(self):
        self.assertIn('cancel', self.offered(self.manager_client)['available'])

    def test_a_bill_with_a_payment_offers_no_cancel_and_says_why(self):
        self.make_payment(self.acme, '100.00', 'TX-1')
        workflow = self.offered(self.manager_client)
        self.assertNotIn('cancel', workflow['available'])
        self.assertTrue(any('can’t be cancelled' in reason for reason in workflow['held_back']))
        # Hiding it is a courtesy; the API is the rule.
        refused = self.transition(self.manager_client, BILLS, self.bill, 'cancel')
        self.assertEqual(refused.status_code, 409)

    def test_a_list_does_not_run_the_checks(self):
        self.make_payment(self.acme, '100.00', 'TX-1')
        rows = self.manager_client.get(BILLS).json()['results']
        # The list still offers it (it didn't evaluate the check); only the form knows better.
        self.assertIn('cancel', rows[0]['workflow']['available'])
        self.assertEqual(rows[0]['workflow']['held_back'], [])
