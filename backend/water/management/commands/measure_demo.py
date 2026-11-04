"""
Times what the demo walkthrough opens, on a local database seeded by
`seed_demo`: the Bills aging view and a consumer's statement (their form, its
related lists and its activity). Local databases only.

    python manage.py measure_demo --user ayesha.khan
"""
import statistics
import time

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext

from core.models import Contact
from foundation import computed

LOCAL_HOSTS = ('127.0.0.1', 'localhost', '::1')


class Command(BaseCommand):
    help = 'Time the Bills aging view and a consumer statement (local database only).'

    def add_arguments(self, parser):
        parser.add_argument('--user', required=True)
        parser.add_argument('--runs', type=int, default=7)
        parser.add_argument('--journey', choices=['water', 'clearance'], default='water')

    def handle(self, *args, user, runs, journey='water', **options):
        host = settings.DATABASES['default'].get('HOST') or 'localhost'
        if host not in LOCAL_HOSTS:
            raise CommandError(f'Refusing to measure on {host}: local databases only.')
        client = Client(SERVER_NAME='localhost')
        client.force_login(get_user_model().objects.get(username=user))
        if journey == 'clearance':
            cases = self.clearance_cases()
            return self.measure(client, cases, runs)
        biggest = (
            computed.annotate(Contact.objects.filter(is_customer=True), Contact).order_by('-outstanding').first()
        )
        id_ = biggest.pk
        bills = '/api/data/billing/bill/'
        cases = [
            (
                'Bills · Aging view: first 100 rows, grouped by age',
                [
                    f'{bills}?filter=state:in:posted&filter=balance:gte:0.01&ordering=-balance&limit=100',
                    f'{bills}aggregate/?filter=state:in:posted&filter=balance:gte:0.01&group_by=days_overdue',
                ],
            ),
            (
                'Bills · Overdue over 90 days: its largest group opened',
                [f'{bills}?filter=state:in:posted&filter=days_overdue:gte:181&ordering=-balance&limit=100'],
            ),
            (
                f'Statement of {biggest.name}: record, schema and activity',
                [
                    f'/api/data/core/contact/{id_}/',
                    '/api/schema/core/contact/',
                    f'/api/data/core/contact/{id_}/history/',
                ],
            ),
            (
                'Statement: its five related lists',
                [
                    f'{bills}?customer={id_}&limit=11&ordering=-issue_date',
                    f'/api/data/billing/payment/?customer={id_}&limit=11',
                    f'/api/data/billing/adjustment/?customer={id_}&limit=11',
                    f'/api/data/water/connection/?consumer={id_}&limit=11',
                    f'/api/data/water/recoverycase/?consumer={id_}&limit=11',
                ],
            ),
            (
                'Customers owing money, biggest first',
                ['/api/data/core/contact/?filter=outstanding:gte:0.01&ordering=-outstanding&limit=100'],
            ),
        ]
        return self.measure(client, cases, runs)

    def clearance_cases(self):
        from clearance.models import Job

        job = Job.objects.filter(number='JOB-2026-0007').first() or Job.objects.first()
        jobs = '/api/data/clearance/job/'
        states = 'booked,documents_in,gd_filed,assessed,duty_paid,examined,released,gate_out'
        return [
            (
                'Jobs by stage: first 100 rows, grouped, with sums',
                [
                    f'{jobs}?filter=state:in:{states}&ordering=number&limit=100',
                    f'{jobs}aggregate/?filter=state:in:{states}&group_by=state',
                ],
            ),
            (
                'Demurrage at risk',
                [f'{jobs}?filter=demurrage_status:in:soon,urgent,accruing&ordering=demurrage_next_deadline&limit=100'],
            ),
            (f'{job.number}: record, schema, activity', [f'{jobs}{job.pk}/', '/api/schema/clearance/job/', f'{jobs}{job.pk}/history/']),
            (
                f'{job.number}: its two related lists',
                [
                    f'/api/data/clearance/container/?job={job.pk}&limit=11',
                    f'/api/data/clearance/disbursement/?job={job.pk}&limit=11',
                ],
            ),
        ]

    def measure(self, client, cases, runs):
        self.stdout.write(f'median of {runs} runs after a warm-up.' + chr(10))
        worst = 0.0
        for label, urls in cases:
            for url in urls:
                response = client.get(url)
                if response.status_code != 200:
                    raise CommandError(f'{url}: HTTP {response.status_code} {response.content[:200]!r}')
            timings, queries = [], 0
            for _ in range(runs):
                with CaptureQueriesContext(connection) as captured:
                    started = time.perf_counter()
                    for url in urls:
                        client.get(url)
                    timings.append((time.perf_counter() - started) * 1000)
                queries = len(captured.captured_queries)
            median = statistics.median(timings)
            worst = max(worst, median)
            self.stdout.write(f'{median:7.1f} ms  {queries:3d} queries  {len(urls)} request(s)  {label}')
        self.stdout.write(f'\nSlowest median {worst:.1f} ms.')
