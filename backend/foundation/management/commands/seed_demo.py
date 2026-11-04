"""
Fill a database with a believable demo, through the same data layer and
workflow the app uses (so every record has a real activity trail).

    python manage.py seed_demo --journey water --confirm <database name>

Refuses to run unless `--confirm` repeats the name of the database it will
write to, so it can't be pointed at the wrong one by accident. Idempotent:
safe to run again; it adds only what is missing. Run it against any
database: the local demo database, Neon, a rehearsal copy.
"""
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

JOURNEYS = {'water': 'water.demo', 'clearance': 'clearance.demo'}


class Command(BaseCommand):
    help = 'Seed a demo journey into the database (idempotent).'

    def add_arguments(self, parser):
        parser.add_argument('--journey', required=True, choices=sorted(JOURNEYS))
        parser.add_argument('--confirm', required=True, help='The name of the database to write to.')
        parser.add_argument('--env-file', default=str(Path(settings.BASE_DIR).parent / '.env'))
        parser.add_argument('--months', type=int, default=12)
        parser.add_argument(
            '--rebase-dates',
            action='store_true',
            help='Instead of seeding: move every date in the demo so the story is right today (run on the morning of the demo).',
        )

    def handle(self, *args, journey, confirm, env_file, months, rebase_dates=False, **options):
        database = settings.DATABASES['default']
        name = str(database['NAME'])
        if confirm != name:
            raise CommandError(
                f'This would write to the database "{name}" on {database.get("HOST") or "this machine"}. '
                f'To go ahead, repeat its name: --confirm {name}'
            )
        if settings.IS_PRODUCTION:
            raise CommandError('Demo data is for development databases only.')
        if settings.CLICKER_JOURNEY != journey:
            raise CommandError(
                f'This database holds the {journey} journey, so run with CLICKER_JOURNEY={journey}: '
                'it decides which roles and models exist.'
            )
        self._refuse_the_other_journey(journey)
        if rebase_dates:
            from foundation import computed, rebase

            days = rebase.rebase_dates(computed.today())
            self.stdout.write(self.style.SUCCESS(f'Dates moved by {days} day(s); the story is anchored to today.'))
            self.stdout.write(self.style.WARNING(
                'Warning: the activity trail is NOT moved. It keeps its real times, so it will read "3 days ago" '
                'next to records dated today. For a demo, reset with a fresh seed instead: scripts/demo_setup.sh --fresh'
            ))
            return
        from importlib import import_module

        module = import_module(JOURNEYS[journey])
        self.stdout.write(f'Seeding the {journey} demo into "{name}" on {database.get("HOST") or "this machine"}.')
        module.Seeder(self.stdout, env_file, months=months).run()
        from foundation import computed, rebase

        if rebase.anchor() is None:
            rebase.set_anchor(computed.today())
        self.stdout.write(self.style.SUCCESS('Done.'))

    def _refuse_the_other_journey(self, journey):
        """Two journeys never share a database: a port owner would otherwise see federal ministries."""
        from clearance.models import Job
        from water.models import Connection

        if journey == 'water' and Job.objects.exists():
            raise CommandError('This database already holds the clearance journey. Use a database of its own for the water board.')
        if journey == 'clearance' and Connection.objects.exists():
            raise CommandError('This database already holds the water journey. Use a database of its own for the clearing agency.')
