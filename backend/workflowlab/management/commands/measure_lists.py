"""
Times the list endpoints at volume and counts their queries: S-4's
performance gate. Local databases only (run after `seed_lab_volume`).

    DATABASE_URL=postgresql://postgres@127.0.0.1:5433/clicker_local \\
        python manage.py measure_lists --user dev-perf

Each request runs once to warm up, then `--runs` times; the median is
reported. The user needs no password: requests go through Django's test
client, signed in directly.
"""
import statistics
import time

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext

from workflowlab.models import LabBill

from .seed_lab_volume import LOCAL_HOSTS

BILLS = '/api/data/workflowlab/labbill/'
TWO_FILTERS = 'filter=state:in:posted&filter=amount:gte:100000'

REQUESTS = [
    ('List, two filters, sorted, first 100 rows', f'{BILLS}?{TWO_FILTERS}&ordering=-amount&limit=100'),
    ('Aggregate: summaries + group by state', f'{BILLS}aggregate/?{TWO_FILTERS}&group_by=state'),
    ('Aggregate: summaries + aging buckets', f'{BILLS}aggregate/?{TWO_FILTERS}&group_by=days_overdue'),
    ('Rows of one group (90+ days)', f'{BILLS}?{TWO_FILTERS}&filter=days_overdue:gte:91&ordering=-amount&limit=100'),
    ('Deep window (rows 9,000–9,100), no filter', f'{BILLS}?ordering=-amount&limit=100&offset=9000'),
    ('Search “karachi” + one filter', f'{BILLS}?q=karachi&filter=state:in:posted&limit=100'),
    ('Sort by computed days overdue', f'{BILLS}?{TWO_FILTERS}&ordering=-days_overdue&limit=100'),
]


class Command(BaseCommand):
    help = 'Time the list and aggregate endpoints at volume (local database only).'

    def add_arguments(self, parser):
        parser.add_argument('--user', required=True)
        parser.add_argument('--runs', type=int, default=7)

    def handle(self, *args, user, runs, **options):
        host = settings.DATABASES['default'].get('HOST') or 'localhost'
        if host not in LOCAL_HOSTS:
            raise CommandError(f'Refusing to measure on {host}: local databases only.')
        client = Client(SERVER_NAME='localhost')
        client.force_login(get_user_model().objects.get(username=user))
        total = LabBill.objects.count()
        self.stdout.write(f'{total:,} lab bills on {host}; median of {runs} runs after one warm-up.\n')
        worst = 0.0
        for label, url in REQUESTS:
            response = client.get(url)
            if response.status_code != 200:
                raise CommandError(f'{label}: HTTP {response.status_code} {response.content[:200]!r}')
            timings = []
            for _ in range(runs):
                with CaptureQueriesContext(connection) as queries:
                    started = time.perf_counter()
                    client.get(url)
                    timings.append((time.perf_counter() - started) * 1000)
            median = statistics.median(timings)
            worst = max(worst, median)
            self.stdout.write(f'{median:7.1f} ms  {len(queries.captured_queries):2d} queries  {label}')
        verdict = 'PASS' if worst < 300 else 'FAIL'
        self.stdout.write(f'\nSlowest median {worst:.1f} ms against a 300 ms budget: {verdict}')
