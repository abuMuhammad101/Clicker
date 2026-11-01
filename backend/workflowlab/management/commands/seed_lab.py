"""
Lab bills and adjustments in every workflow state, for looking at the S-3
screens (CLICKER_LAB=1). Idempotent: a record that already exists (by
customer or reason) is left as it is.

    python manage.py seed_lab --manager dev-verify --clerk dev-clerk-home

The requester of each request is the user given, so "you're the requester"
and "waiting for a Manager" both have a record to show.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from foundation import numbering
from workflowlab.models import LabAdjustment, LabBill

BILLS = [
    ('Indus Traders', '9500.00', 'draft'),
    ('Karachi Port Logistics', '245000.00', 'draft'),
    ('Mehran Textiles', '38000.00', 'posted'),
    ('Karachi Cold Storage', '14500.00', 'cancelled'),
]

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
        for customer, amount, state in BILLS:
            if LabBill.objects.filter(customer=customer).exists():
                continue
            LabBill.objects.create(
                customer=customer,
                amount=Decimal(amount),
                state=state,
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
