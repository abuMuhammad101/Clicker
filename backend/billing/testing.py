"""A small world for tests: the roles, and bills, payments and adjustments made the way people make them (through the API). Test code only."""
import datetime
from decimal import Decimal
from unittest import mock

from core.models import Contact, Staff
from foundation.roles import MANAGER
from foundation.test_roles import member_of

TODAY = datetime.date(2026, 11, 3)

BILLS = '/api/data/billing/bill/'
LINES = '/api/data/billing/billline/'
PAYMENTS = '/api/data/billing/payment/'
ADJUSTMENTS = '/api/data/billing/adjustment/'


def named(user, first, last):
    user.first_name, user.last_name = first, last
    user.save(update_fields=['first_name', 'last_name'])
    return user


class BillingWorld:
    """Mix into a TestCase (or TransactionTestCase) and call `self.build_world()` in setUp."""

    def build_world(self, today=TODAY):
        patcher = mock.patch('foundation.computed.today', return_value=today)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.manager, self.manager_client = member_of(MANAGER, 'manager')
        self.other_manager, self.other_manager_client = member_of(MANAGER, 'manager-2')
        self.officer, self.officer_client = member_of('Billing officer', 'officer')
        self.cashier, self.cashier_client = member_of('Cashier', 'cashier')
        self.recovery, self.recovery_client = member_of('Recovery officer', 'recovery')
        self.recovery2, self.recovery2_client = member_of('Recovery officer', 'recovery-2')
        self.auditor, self.auditor_client = member_of('Auditor', 'auditor')
        for user, first, last in [
            (self.manager, 'Ayesha', 'Khan'),
            (self.other_manager, 'Tariq', 'Mehmood'),
            (self.officer, 'Bilal', 'Ahmed'),
            (self.cashier, 'Imran', 'Siddiqui'),
            (self.recovery, 'Farhan', 'Raza'),
            (self.recovery2, 'Nida', 'Hussain'),
            (self.auditor, 'Zainab', 'Qureshi'),
        ]:
            named(user, first, last)
        self.staff = {
            'recovery': Staff.objects.create(display_name='Farhan Raza', user=self.recovery),
            'recovery2': Staff.objects.create(display_name='Nida Hussain', user=self.recovery2),
        }

    # ---- records, made through the API

    def customer(self, name='Federal Steel Corporation (demo)', terms=30, **values):
        return Contact.objects.create(name=name, type='company', is_customer=True, payment_terms_days=terms, **values)

    def make_bill(self, customer, amount='1000.00', issue='2026-08-01', post=True, client=None):
        client = client or self.officer_client
        response = client.post(BILLS, {'customer': customer.pk, 'issue_date': issue}, format='json')
        assert response.status_code == 201, response.content
        bill_id = response.json()['id']
        line = client.post(
            LINES,
            {'bill': bill_id, 'description': 'Water charge', 'quantity': '1', 'unit_price': amount},
            format='json',
        )
        assert line.status_code == 201, line.content
        if post:
            posted = client.post(f'{BILLS}{bill_id}/transitions/post/', format='json')
            assert posted.status_code == 200, posted.content
        from billing.models import Bill

        return Bill.objects.get(pk=bill_id)

    def make_payment(self, customer, amount, reference, method='bank_transfer', date='2026-10-01', post=True, client=None):
        client = client or self.cashier_client
        response = client.post(
            PAYMENTS,
            {'customer': customer.pk, 'amount': amount, 'method': method, 'reference': reference, 'payment_date': date},
            format='json',
        )
        assert response.status_code == 201, response.content
        payment_id = response.json()['id']
        if post:
            posted = client.post(f'{PAYMENTS}{payment_id}/transitions/post/', format='json')
            assert posted.status_code == 200, posted.content
        from billing.models import Payment

        return Payment.objects.get(pk=payment_id)

    def make_adjustment(self, bill, amount, kind='write_off', reason='Disputed meter reading', client=None, request=True):
        client = client or self.officer_client
        response = client.post(
            ADJUSTMENTS, {'bill': bill.pk, 'kind': kind, 'amount': amount, 'reason': reason}, format='json'
        )
        assert response.status_code == 201, response.content
        adjustment_id = response.json()['id']
        if request:
            sent = client.post(f'{ADJUSTMENTS}{adjustment_id}/transitions/request/', format='json')
            assert sent.status_code == 200, sent.content
        from billing.models import Adjustment

        return Adjustment.objects.get(pk=adjustment_id)

    def transition(self, client, url_base, obj, name):
        return client.post(f'{url_base}{obj.pk}/transitions/{name}/', format='json')


def money(value):
    return Decimal(str(value))
