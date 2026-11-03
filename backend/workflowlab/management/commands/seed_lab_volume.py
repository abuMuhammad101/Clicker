"""
Thousands of lab bills, for measuring lists at volume (S-4's performance
gate). Local databases only: it refuses a remote host such as Neon, the
shared development database.

    DATABASE_URL=postgresql://postgres@127.0.0.1:5433/clicker_local \
        python manage.py seed_lab_volume --count 10000 --user dev-perf

Bills get a BULK- number (not the yearly sequence), a customer from a fixed
list, an amount, a state (mostly posted) and dates over the last 400 days.
Deterministic: the same count gives the same bills.
"""
import datetime
import random
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from foundation import computed
from workflowlab.models import LabBill

LOCAL_HOSTS = ('127.0.0.1', 'localhost', '::1')

TOWNS = ['Karachi', 'Lahore', 'Hyderabad', 'Multan', 'Quetta', 'Peshawar', 'Sialkot', 'Faisalabad', 'Gwadar', 'Sukkur']
TRADES = ['Traders', 'Textiles', 'Steel Works', 'Agro Exports', 'Cold Storage', 'Logistics', 'Pharma', 'Cotton Mills',
          'Marble House', 'Fisheries', 'Motors', 'Paper Mills', 'Rice Exports', 'Ceramics', 'Leather Goods',
          'Surgical', 'Sports Goods', 'Cement', 'Dairies', 'Packaging']


class Command(BaseCommand):
    help = 'Create many lab bills on a LOCAL database, for performance measurement.'

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=10000)
        parser.add_argument('--user', required=True, help='Username recorded as creator.')

    def handle(self, *args, count, user, **options):
        host = settings.DATABASES['default'].get('HOST') or 'localhost'
        if host not in LOCAL_HOSTS:
            raise CommandError(f'Refusing to seed volume data on {host}: local databases only.')
        try:
            author = get_user_model().objects.get(username=user)
        except get_user_model().DoesNotExist:
            raise CommandError(f'No user "{user}".')

        rng = random.Random(count)
        customers = [f'{town} {trade}' for town in TOWNS for trade in TRADES]
        today = computed.today()
        bills = []
        for index in range(1, count + 1):
            issued = today - datetime.timedelta(days=rng.randint(0, 400))
            state = rng.choices(['posted', 'draft', 'cancelled'], weights=[78, 17, 5])[0]
            amount = Decimal(round(rng.lognormvariate(11.5, 1.1), -2)).quantize(Decimal('0.01'))
            bills.append(LabBill(
                number=f'BULK-{index:06d}',
                customer=rng.choice(customers),
                amount=amount,
                issued_on=issued,
                due_date=issued + datetime.timedelta(days=rng.choice([15, 30, 30, 45, 60])),
                state=state,
                created_by=author,
                updated_by=author,
            ))
        with transaction.atomic():
            LabBill.objects.filter(number__startswith='BULK-').delete()
            LabBill.objects.bulk_create(bills, batch_size=2000)
        self.stdout.write(self.style.SUCCESS(f'{count} bulk lab bills on {host}.'))
