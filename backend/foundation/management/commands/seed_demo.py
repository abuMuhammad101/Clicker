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

JOURNEYS = {'water': 'water.demo'}


class Command(BaseCommand):
    help = 'Seed a demo journey into the database (idempotent).'

    def add_arguments(self, parser):
        parser.add_argument('--journey', required=True, choices=sorted(JOURNEYS))
        parser.add_argument('--confirm', required=True, help='The name of the database to write to.')
        parser.add_argument('--env-file', default=str(Path(settings.BASE_DIR).parent / '.env'))
        parser.add_argument('--months', type=int, default=12)

    def handle(self, *args, journey, confirm, env_file, months, **options):
        database = settings.DATABASES['default']
        name = str(database['NAME'])
        if confirm != name:
            raise CommandError(
                f'This would write to the database "{name}" on {database.get("HOST") or "this machine"}. '
                f'To go ahead, repeat its name: --confirm {name}'
            )
        if settings.IS_PRODUCTION:
            raise CommandError('Demo data is for development databases only.')
        from importlib import import_module

        module = import_module(JOURNEYS[journey])
        self.stdout.write(f'Seeding the {journey} demo into "{name}" on {database.get("HOST") or "this machine"}.')
        module.Seeder(self.stdout, env_file, months=months).run()
        self.stdout.write(self.style.SUCCESS('Done.'))
