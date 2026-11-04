"""A small clearing-agency world for tests: the five roles, a client, and jobs made through the API. Test code only."""
import datetime
from decimal import Decimal
from unittest import mock

from core.models import Contact, Staff
from foundation.test_roles import member_of

TODAY = datetime.date(2026, 11, 4)

JOBS = '/api/data/clearance/job/'
CONTAINERS = '/api/data/clearance/container/'
DISBURSEMENTS = '/api/data/clearance/disbursement/'
BILLS = '/api/data/billing/bill/'


def named(user, first, last):
    user.first_name, user.last_name = first, last
    user.save(update_fields=['first_name', 'last_name'])
    return user


class ClearanceWorld:
    """Mix into a TestCase / TransactionTestCase and call `self.build_world()` in setUp."""

    def build_world(self, today=TODAY):
        patcher = mock.patch('foundation.computed.today', return_value=today)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.owner, self.owner_client = member_of('Owner', 'owner')
        self.coordinator, self.coordinator_client = member_of('Coordinator', 'coordinator')
        self.documentation, self.documentation_client = member_of('Documentation', 'documentation')
        self.agent, self.agent_client = member_of('Field agent', 'agent')
        self.agent2, self.agent2_client = member_of('Field agent', 'agent-2')
        self.accounts, self.accounts_client = member_of('Accounts', 'accounts')
        self.accounts2, self.accounts2_client = member_of('Accounts', 'accounts-2')
        for user, first, last in [
            (self.owner, 'Hamza', 'Farooqui'), (self.coordinator, 'Mehwish', 'Rauf'), (self.documentation, 'Sadia', 'Anwar'),
            (self.agent, 'Rashid', 'Baloch'), (self.agent2, 'Kamran', 'Lashari'), (self.accounts, 'Ibrahim', 'Qazi'),
            (self.accounts2, 'Noor', 'Jamal'),
        ]:
            named(user, first, last)
        self.staff = {
            'agent': Staff.objects.create(display_name='Rashid Baloch', user=self.agent, role='Field agent'),
            'agent2': Staff.objects.create(display_name='Kamran Lashari', user=self.agent2, role='Field agent'),
        }
        self.client_contact = Contact.objects.create(
            name='Indus Textile Mills (demo)', type='company', is_customer=True, payment_terms_days=30
        )

    # ---- records through the API

    def make_job(self, client=None, assigned=None, fee='125000.00', as_user=None, **values):
        client = client or self.owner_client
        body = {'client': self.client_contact.pk, 'goods': 'Cotton yarn', 'bl_number': 'MAEU1234', 'service_fee': fee, **values}
        if assigned:
            body['assigned_to'] = assigned.pk
        response = client.post(JOBS, body, format='json')
        assert response.status_code == 201, response.content
        from clearance.models import Job

        return Job.objects.get(pk=response.json()['id'])

    def move(self, client, job, name):
        return client.post(f'{JOBS}{job.pk}/transitions/{name}/', format='json')

    def advance(self, job, to='released', client=None):
        """Walk a job along the main line as the owner (who holds every grant)."""
        client = client or self.owner_client
        path = [('documents_in', 'documents_in'), ('file_gd', 'gd_filed'), ('assess', 'assessed'), ('pay_duty', 'duty_paid'),
                ('examine', 'examined'), ('release', 'released'), ('gate_out', 'gate_out')]
        for name, state in path:
            response = self.move(client, job, name)
            assert response.status_code == 200, (name, response.content)
            if state == to:
                break
        job.refresh_from_db()
        return job

    def make_container(self, job, number='MSKU1234567', client=None, **values):
        body = {'job': job.pk, 'number': number, 'size': '40', 'discharged_on': '2026-11-01', 'free_days': 7, **values}
        return (client or self.owner_client).post(CONTAINERS, body, format='json')

    def make_disbursement(self, job, amount='500000.00', kind='customs_duty', receipt='CUS-1', client=None, approve_by=None, **values):
        body = {'job': job.pk, 'kind': kind, 'amount': amount, 'receipt_ref': receipt, 'paid_on': '2026-11-02', **values}
        response = (client or self.owner_client).post(DISBURSEMENTS, body, format='json')
        assert response.status_code == 201, response.content
        from clearance.models import Disbursement

        disbursement = Disbursement.objects.get(pk=response.json()['id'])
        if approve_by is not None:
            approved = approve_by.post(f'{DISBURSEMENTS}{disbursement.pk}/transitions/approve/', format='json')
            assert approved.status_code == 200, approved.content
            disbursement.refresh_from_db()
        return disbursement


def money(value):
    return Decimal(str(value))
