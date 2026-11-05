"""The Journey B seed: the story's numbers, idempotence, refusing the other journey, and moving its dates."""
import datetime
import tempfile
from io import StringIO
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from billing.models import Bill, Payment
from clearance.models import Container, Disbursement, Job
from foundation import computed
from foundation.models import AuditEntry

TODAY = datetime.date(2026, 11, 4)


@override_settings(CLICKER_JOURNEY='clearance')
class SeedClearanceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.env_file = Path(tempfile.mkdtemp()) / '.env'
        cls.database = str(settings.DATABASES['default']['NAME'])
        cls.run_seed(cls)
        cls.first_audit = AuditEntry.objects.count()

    def run_seed(self, **extra):
        out = StringIO()
        with mock.patch('foundation.computed.today', return_value=TODAY):
            call_command('seed_demo', journey='clearance', confirm=self.database, env_file=str(self.env_file), stdout=out, **extra)
        return out.getvalue()

    def test_the_story_has_the_planned_shape(self):
        self.assertEqual(Job.objects.count(), 42)
        by_state = {state: Job.objects.filter(state=state).count() for state, _ in Job.STATE_CHOICES}
        self.assertEqual(by_state['assessed'], 8)
        self.assertEqual(by_state['closed'], 9)
        self.assertEqual(Container.objects.count(), 28)
        # Every closed job has a posted invoice.
        for job in Job.objects.filter(state='closed'):
            self.assertEqual(Bill.objects.get(pk=job.invoice_id).state, 'posted')
        self.assertGreater(Payment.objects.filter(state='posted').count(), 2)

    def test_the_countdown_story_is_two_accruing_three_on_their_last_days_and_the_rest_comfortable(self):
        with mock.patch('foundation.computed.today', return_value=TODAY):
            inside = computed.annotate(Container.objects.filter(gate_out_on__isnull=True), Container)
            statuses = sorted(inside.values_list('deadline_status', flat=True))
        self.assertEqual(statuses.count('accruing'), 2)
        self.assertEqual(statuses.count('urgent'), 3)
        self.assertEqual(statuses.count('soon'), 0)
        self.assertEqual(len(statuses), 17)

    def test_the_live_job_is_ready_to_gate_out(self):
        job = Job.objects.get(number='JOB-2026-0007')
        self.assertEqual(job.state, 'released')
        self.assertIsNone(job.invoice_id)
        states = sorted(job.disbursements.values_list('state', flat=True))
        self.assertEqual(states, ['approved', 'approved', 'approved', 'recorded'])

    def test_running_it_again_adds_nothing(self):
        self.run_seed()
        self.assertEqual(AuditEntry.objects.count(), self.first_audit)
        self.assertEqual(Job.objects.count(), 42)
        self.assertEqual(Disbursement.objects.count(), Disbursement.objects.values('job', 'kind', 'receipt_ref').distinct().count())

    def test_it_refuses_a_database_that_holds_the_water_journey(self):
        with mock.patch('water.models.Connection.objects') as connections:
            connections.exists.return_value = True
            with self.assertRaises(CommandError) as problem:
                self.run_seed()
        self.assertIn('water', str(problem.exception))

    def test_it_refuses_to_run_as_the_wrong_journey(self):
        with override_settings(CLICKER_JOURNEY='water'):
            with self.assertRaises(CommandError):
                self.run_seed()

    def test_rebasing_moves_every_date_by_the_same_days_and_only_once(self):
        job = Job.objects.get(number='JOB-2026-0007')
        container = job.containers.first()
        bill = Bill.objects.exclude(due_date=None).first()
        before = (container.discharged_on, bill.issue_date, bill.due_date, job.eta, job.stage_since)
        later = TODAY + datetime.timedelta(days=3)
        out = StringIO()
        with mock.patch('foundation.computed.today', return_value=later):
            call_command('seed_demo', journey='clearance', confirm=self.database, env_file=str(self.env_file), rebase_dates=True, stdout=out)
        # It says plainly that the trail stays put and what to do on demo morning instead.
        self.assertIn('activity trail is NOT moved', out.getvalue())
        self.assertIn('scripts/demo_setup.sh --fresh', out.getvalue())
        container.refresh_from_db(), bill.refresh_from_db(), job.refresh_from_db()
        after = (container.discharged_on, bill.issue_date, bill.due_date, job.eta, job.stage_since)
        self.assertEqual([b + datetime.timedelta(days=3) for b in before], list(after))
        # The same day again: nothing moves.
        with mock.patch('foundation.computed.today', return_value=later):
            call_command('seed_demo', journey='clearance', confirm=self.database, env_file=str(self.env_file), rebase_dates=True, stdout=StringIO())
        container.refresh_from_db()
        self.assertEqual(container.discharged_on, after[0])
        # The trail keeps the real time: no audit entry was added or changed.
        self.assertEqual(AuditEntry.objects.count(), self.first_audit)
