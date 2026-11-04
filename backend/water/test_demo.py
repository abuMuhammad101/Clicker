"""
The demo seed: idempotent, guarded, and silent about passwords. Run on a small
roster and three months so it takes seconds, not minutes.
"""
import datetime
import tempfile
from io import StringIO
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from billing.models import Adjustment, Bill, Payment
from core.models import Contact
from foundation.models import AuditEntry

from . import demo
from .models import Connection, RecoveryCase

SMALL_ROSTER = demo._consumers()[:6] + demo._consumers()[40:46] + demo._consumers()[100:106]


@override_settings(CLICKER_JOURNEY='water')
class SeedDemoTests(TestCase):
    def counts(self):
        return [
            model.objects.count()
            for model in (Contact, Connection, Bill, Payment, Adjustment, RecoveryCase, AuditEntry, get_user_model())
        ]

    def seed(self, env_file):
        out = StringIO()
        with (
            mock.patch.object(demo, '_consumers', lambda: SMALL_ROSTER),
            mock.patch('foundation.computed.today', return_value=datetime.date(2026, 11, 3)),
        ):
            call_command('seed_demo', journey='water', confirm=self.database, env_file=str(env_file), months=3, stdout=out)
        return out.getvalue()

    def setUp(self):
        from django.conf import settings

        self.database = str(settings.DATABASES['default']['NAME'])
        self.env_file = Path(tempfile.mkdtemp()) / '.env'

    def test_running_it_again_adds_nothing_at_all_even_to_the_audit_log(self):
        self.seed(self.env_file)
        first = self.counts()
        self.assertGreater(first[2], 20)  # bills were made
        self.seed(self.env_file)
        self.assertEqual(self.counts(), first)

    def test_it_will_not_run_without_the_databases_name(self):
        with self.assertRaises(CommandError) as error:
            call_command('seed_demo', journey='water', confirm='some-other-db', env_file=str(self.env_file))
        self.assertIn(self.database, str(error.exception))
        self.assertEqual(Bill.objects.count(), 0)

    def test_passwords_go_to_the_env_file_and_never_to_the_screen(self):
        output = self.seed(self.env_file)
        written = self.env_file.read_text(encoding='utf-8')
        keys = [line for line in written.splitlines() if line.startswith('DEMO_PASSWORD_')]
        self.assertEqual(len(keys), 8)
        for line in keys:
            self.assertNotIn(line.split('=', 1)[1], output)
        # The same file gives the same passwords the next time, and for another database.
        self.seed(self.env_file)
        self.assertEqual(self.env_file.read_text(encoding='utf-8'), written)
        manager = get_user_model().objects.get(username='ayesha.khan')
        self.assertTrue(manager.check_password(dict(l.split('=', 1) for l in keys)['DEMO_PASSWORD_AYESHA_KHAN']))

    def test_every_person_has_a_name_so_no_trail_shows_a_login(self):
        self.seed(self.env_file)
        for user in get_user_model().objects.exclude(username='clicker-automation'):
            self.assertTrue(user.get_full_name(), user.username)
        names = set(AuditEntry.objects.values_list('actor__first_name', flat=True))
        self.assertNotIn('', names)

    def test_the_consumers_are_all_marked_demo(self):
        self.seed(self.env_file)
        self.assertTrue(all(name.endswith('(demo)') for name in Contact.objects.values_list('name', flat=True)))
