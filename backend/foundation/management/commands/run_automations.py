"""
Run the scheduled work (see foundation.automation). Safe to run as often as
you like: every automation is idempotent.

    python manage.py run_automations
    python manage.py run_automations --only open_recovery_cases
"""
from django.core.management.base import BaseCommand, CommandError

from foundation import automation


class Command(BaseCommand):
    help = 'Run every automation as "Clicker automation".'

    def add_arguments(self, parser):
        parser.add_argument('--only', help='Run just this automation.')

    def handle(self, *args, only=None, **options):
        automation.discover()
        if only and only not in automation.REGISTRY:
            raise CommandError(f'No automation called "{only}". Known: {", ".join(automation.REGISTRY)}.')
        for name, report in automation.run_all(only):
            self.stdout.write(f'{name}: {report}')
