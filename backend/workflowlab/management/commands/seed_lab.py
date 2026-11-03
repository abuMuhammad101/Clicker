"""
Lab bills and adjustments in every workflow state, for looking at the S-3
screens (CLICKER_LAB=1). Idempotent: a record that already exists (by
customer or reason) is left as it is, except that a bill without dates gets
its issue and due dates (S-4's aging needs them).

    python manage.py seed_lab --manager dev-verify --clerk dev-clerk-home

The requester of each request is the user given, so "you're the requester"
and "waiting for a Manager" both have a record to show.
"""
import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from foundation import computed, numbering
from workflowlab.models import LabAdjustment, LabBill

# (customer, amount, state, issued this many days ago); due 30 days after issue.
# Posted bills land in every aging bucket.
BILLS = [
    ('Indus Traders', '9500.00', 'draft', 2),
    ('Karachi Port Logistics', '245000.00', 'draft', 1),
    ('Mehran Textiles', '38000.00', 'posted', 40),
    ('Karachi Cold Storage', '14500.00', 'cancelled', 20),
    ('Sindh Agro Exports', '1250000.00', 'posted', 150),
    ('Hyderabad Cotton Mills', '2150000.00', 'posted', 200),
    ('Lahore Steel Works', '860000.00', 'posted', 110),
    ('Quetta Fruit Company', '410000.00', 'posted', 75),
    ('Gwadar Fisheries', '95000.00', 'posted', 10),
    ('Peshawar Marble House', '530000.00', 'posted', 1),
]
PAYMENT_DAYS = 30

# (reason, amount, state, requested by: 'clerk' | 'manager' | None)
ADJUSTMENTS = [
    ('Damaged stock returned', '2400.00', 'draft', None),
    ('Late delivery discount, Indus Traders', '4750.00', 'requested', 'clerk'),
    ('Write-off, Old Mill Supplies balance', '18200.00', 'requested', 'manager'),
    ('Short shipment credit, Mehran Textiles', '6100.00', 'approved', 'clerk'),
    ('Goodwill discount, March', '12000.00', 'rejected', 'clerk'),
]


class Command(BaseCommand):
    help = 'Create lab bills and adjustments in every workflow state (development only).'

    def add_arguments(self, parser):
        parser.add_argument('--manager', required=True, help='Username of a Manager (requests some adjustments).')
        parser.add_argument('--clerk', required=True, help='Username of a Clerk (creates and requests the rest).')

    @transaction.atomic
    def handle(self, *args, manager, clerk, **options):
        users = {}
        for role, username in (('manager', manager), ('clerk', clerk)):
            try:
                users[role] = get_user_model().objects.get(username=username)
            except get_user_model().DoesNotExist:
                raise CommandError(f'No user "{username}".')

        created = 0
        today = computed.today()
        for customer, amount, state, days_ago in BILLS:
            issued = today - datetime.timedelta(days=days_ago)
            dates = {'issued_on': issued, 'due_date': issued + datetime.timedelta(days=PAYMENT_DAYS)}
            existing = LabBill.objects.filter(customer=customer).first()
            if existing:
                if existing.due_date is None:
                    LabBill.objects.filter(pk=existing.pk).update(**dates)
                continue
            LabBill.objects.create(
                customer=customer,
                amount=Decimal(amount),
                state=state,
                **dates,
                created_by=users['clerk'],
                updated_by=users['clerk'],
                **numbering.assigned_values(LabBill),
            )
            created += 1

        for reason, amount, state, requester in ADJUSTMENTS:
            if LabAdjustment.objects.filter(reason=reason).exists():
                continue
            author = users[requester or 'clerk']
            LabAdjustment.objects.create(
                reason=reason,
                amount=Decimal(amount),
                state=state,
                requested_by=users[requester] if requester else None,
                created_by=author,
                updated_by=author,
                **numbering.assigned_values(LabAdjustment),
            )
            created += 1

        self.stdout.write(self.style.SUCCESS(f'{created} lab records created.'))
