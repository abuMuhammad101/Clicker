"""
Journey A: a water utility tracking billing and recovery for bulk consumers.

Everything money-shaped (bills, payments, reductions) is the shared `billing`
app. What lives here is what only a water utility has: tariffs, connections
(and whether they are metered or billed on an average), monthly billing runs,
and recovery cases for consumers who do not pay.
"""
import datetime
from decimal import Decimal

from django.contrib.postgres.indexes import GinIndex, OpClass
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.db.models import DecimalField, F, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce, Upper
from django.utils import timezone

from billing import services
from billing.expressions import MONEY, ZERO, customer_oldest_overdue_days, customer_outstanding
from core.models import Contact, Staff
from foundation import actions
from foundation.computed import over
from foundation.models import ClickerModel
from foundation.money import format_money, quantize
from foundation.rules import USER

BILLING_OFFICER = 'Billing officer'
RECOVERY_OFFICER = 'Recovery officer'

DISTRICTS = [
    ('central', 'Central'),
    ('east', 'East'),
    ('west', 'West'),
    ('south', 'South'),
    ('korangi', 'Korangi'),
    ('malir', 'Malir'),
    ('keamari', 'Keamari'),
]


class Tariff(ClickerModel):
    CATEGORY_CHOICES = [
        ('federal', 'Federal government'),
        ('provincial', 'Provincial government'),
        ('military', 'Military'),
        ('port_utility', 'Port & utility'),
        ('industrial', 'Industrial'),
        ('commercial', 'Commercial'),
    ]

    name = models.CharField(max_length=120)
    category = models.CharField(max_length=16, choices=CATEGORY_CHOICES)
    rate_per_kgal = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='rate per 1,000 gallons',
    )
    sewerage_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))],
        verbose_name='sewerage %',
        help_text='Charged on top of the water charge, as a percentage of it.',
    )
    effective_from = models.DateField()

    class Meta:
        ordering = ['category', 'name']

    class Schema:
        icon = 'tag'
        display_field = 'name'
        field_types = {'rate_per_kgal': 'currency'}
        list_display = ['name', 'category', 'rate_per_kgal', 'sewerage_percent', 'effective_from']
        list_sort = [{'field': 'category', 'direction': 'asc'}]
        search_fields = ['name']
        default_grants = {
            BILLING_OFFICER: ['view_tariff', 'add_tariff', 'change_tariff'],
            RECOVERY_OFFICER: ['view_tariff'],
            'Cashier': ['view_tariff'],
        }
        views = [{'key': 'by_category', 'label': 'By category', 'group_by': 'category'}]

    def __str__(self):
        return self.name


class Connection(ClickerModel):
    BASIS_CHOICES = [('metered', 'Metered'), ('average', 'Average')]
    STATUS_CHOICES = [('active', 'Active'), ('disputed', 'Disputed'), ('disconnected', 'Disconnected')]

    number = models.CharField(
        max_length=32,
        unique=True,
        validators=[RegexValidator(r'^CON-[A-Z0-9-]+$', 'Use the form CON-KHI-00417.')],
        help_text='Set once, when the connection is created.',
    )
    consumer = models.ForeignKey(Contact, on_delete=models.PROTECT, related_name='connections')
    district = models.CharField(max_length=16, choices=DISTRICTS)
    tariff = models.ForeignKey(Tariff, on_delete=models.PROTECT, related_name='connections')
    size_mm = models.PositiveIntegerField(
        verbose_name='size (mm)', validators=[MinValueValidator(15), MaxValueValidator(2400)]
    )
    billing_basis = models.CharField(max_length=8, choices=BASIS_CHOICES, default='average')
    meter_number = models.CharField(max_length=40, blank=True)
    assessed_monthly_kgal = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='assessed monthly consumption (thousand gallons)',
        help_text='What the bill is based on. For an average connection it is the average; for a metered one, the last reading’s monthly use.',
    )
    status = models.CharField(max_length=14, choices=STATUS_CHOICES, default='active')
    account_officer = models.ForeignKey(
        Staff, null=True, blank=True, on_delete=models.PROTECT, related_name='connections'
    )

    class Meta:
        ordering = ['number']
        indexes = [
            models.Index(fields=['district'], name='connection_district'),
            models.Index(fields=['billing_basis'], name='connection_basis'),
            models.Index(fields=['status'], name='connection_status'),
            GinIndex(OpClass(Upper('number'), name='gin_trgm_ops'), name='connection_number_trgm'),
        ]

    class Schema:
        icon = 'plug'
        display_field = 'number'
        restricted_fields = ['number']
        domains = {'consumer': {'is_customer': True}, 'account_officer': {'active': True}}
        field_types = {}
        search_fields = ['number', 'meter_number']
        list_display = ['number', 'consumer', 'district', 'tariff', 'billing_basis', 'assessed_monthly_kgal', 'status']
        groups = [
            {'label': 'Connection', 'fields': ['number', 'consumer', 'district', 'tariff', 'size_mm']},
            {'label': 'How it is billed', 'fields': ['billing_basis', 'meter_number', 'assessed_monthly_kgal']},
            {'label': 'Status', 'fields': ['status', 'account_officer']},
        ]
        visible_when = {'meter_number': {'field': 'billing_basis', 'equals': 'metered'}}
        default_grants = {
            BILLING_OFFICER: [
                'view_connection',
                'add_connection',
                'change_connection',
                'view_connection_number',
                'add_connection_number',
            ],
        }
        summaries = [
            # The story: almost every bulk connection is billed on an average.
            {'label': 'Billed on averages', 'aggregate': 'count', 'filter': ['billing_basis:in:average']},
            {'label': 'Connections', 'aggregate': 'count'},
            {'label': 'Disputed', 'aggregate': 'count', 'filter': ['status:in:disputed']},
            {'label': 'Assessed (thousand gallons a month)', 'aggregate': 'sum', 'field': 'assessed_monthly_kgal'},
        ]
        views = [
            {'key': 'averages', 'label': 'Billed on averages', 'filters': ['billing_basis:in:average']},
            {'key': 'by_district', 'label': 'By district', 'group_by': 'district'},
            {'key': 'by_basis', 'label': 'By billing basis', 'group_by': 'billing_basis'},
            {'key': 'disputed', 'label': 'Disputed', 'filters': ['status:in:disputed']},
        ]

    def clean(self):
        if self.billing_basis == 'metered' and not self.meter_number.strip():
            raise ValidationError({'meter_number': 'A metered connection needs its meter number.'})
        if self.consumer_id and not self.consumer.is_customer:
            raise ValidationError({'consumer': 'Choose a customer: this contact isn’t marked as one.'})

    def __str__(self):
        return self.number


class BillingRun(ClickerModel):
    STATE_CHOICES = [('draft', 'Draft'), ('generated', 'Generated'), ('posted', 'Posted')]

    number = models.CharField(max_length=32, blank=True, editable=False)
    period = models.DateField(help_text='The first day of the month being billed.')
    district = models.CharField(
        max_length=16, choices=DISTRICTS, blank=True, help_text='Leave blank to bill every district.'
    )
    issue_date = models.DateField(default=timezone.localdate, help_text='The date on every bill in the run.')
    state = models.CharField(max_length=16, choices=STATE_CHOICES, default='draft', editable=False)

    class Meta:
        ordering = ['-period', '-id']
        verbose_name = 'billing run'

    class Schema:
        icon = 'calendar-clock'
        display_field = 'label'
        numbering = {'field': 'number', 'prefix': 'RUN', 'digits': 4}
        list_display = ['number', 'period', 'district', 'issue_date', 'bills', 'total_billed', 'state']
        list_sort = [{'field': 'period', 'direction': 'desc'}]
        groups = [
            {'label': 'What to bill', 'fields': ['number', 'period', 'district', 'issue_date']},
            {'label': 'What it made', 'fields': ['bills', 'total_billed']},
        ]
        related_lists = [
            {'relation': 'items', 'label': 'Bills', 'columns': ['connection', 'bill', 'bill_total']},
        ]
        computed = {
            'bills': {
                'label': 'Bills made',
                'type': 'integer',
                'description': 'How many bills this run generated',
                'requires': ['water.connectionbill'],
                'expression': over()(
                    lambda context: Coalesce(
                        Subquery(
                            ConnectionBill.objects.filter(run=OuterRef('pk'))
                            .order_by()
                            .values('run')
                            .annotate(total=models.Count('pk'))
                            .values('total'),
                            output_field=models.IntegerField(),
                        ),
                        Value(0),
                    )
                ),
            },
            'total_billed': {
                'label': 'Total billed',
                'type': 'currency',
                'description': 'The sum of the bills this run generated',
                'requires': ['water.connectionbill'],
                'expression': over()(
                    lambda context: Coalesce(
                        Subquery(
                            ConnectionBill.objects.filter(run=OuterRef('pk'))
                            .order_by()
                            .values('run')
                            .annotate(total=Sum('bill__amount_total'))
                            .values('total'),
                            output_field=MONEY,
                        ),
                        ZERO,
                    )
                ),
            },
        }
        workflow = {
            'field': 'state',
            'path': ['draft', 'generated', 'posted'],
            'tones': {'generated': 'warning', 'posted': 'positive'},
            'locked': ['generated', 'posted'],
            'transitions': {
                'generate': {
                    'label': 'Generate bills', 'waiting_verb': 'generate the bills for {this}', 'action': 'generate the bills',
                    'from': ['draft'],
                    'to': 'generated',
                    'run': 'generate_bills',
                    'hint': 'One draft bill for every active connection in scope. A month is billed once per connection.',
                },
                'post_all': {
                    'label': 'Post all', 'waiting_verb': 'post all the bills in {this}', 'action': 'post all the bills',
                    'from': ['generated'],
                    'to': 'posted',
                    'run': 'post_bills',
                    'confirm': 'Every bill in this run is posted. Posted bills can’t be edited, only reduced.',
                },
            },
        }
        default_grants = {BILLING_OFFICER: ['view_billingrun', 'add_billingrun', 'change_billingrun', 'generate_billingrun', 'post_all_billingrun']}
        summaries = [
            {'label': 'Runs', 'aggregate': 'count'},
            {'label': 'Billed in all', 'aggregate': 'sum', 'field': 'total_billed'},
        ]
        views = [{'key': 'unposted', 'label': 'Not yet posted', 'filters': ['state:in:draft,generated']}]

    def clean(self):
        if self.period and self.period.day != 1:
            raise ValidationError({'period': 'Use the first day of the month.'})

    @property
    def label(self):
        base = self.period.strftime('%B %Y') if self.period else 'Billing run'
        scope = dict(DISTRICTS).get(self.district, 'all districts')
        return f'{base}, {scope}'

    def __str__(self):
        return self.label

    def in_scope(self):
        connections = Connection.objects.select_related('tariff', 'consumer').filter(status='active')
        if self.district:
            connections = connections.filter(district=self.district)
        return list(connections.order_by('number'))

    def generate_bills(self, ctx):
        """One draft bill per active connection in scope, with its water and sewerage lines."""
        from billing.models import Bill, BillLine

        connections = self.in_scope()
        if not connections:
            raise actions.Refused('There are no active connections in scope.')
        already = ConnectionBill.objects.filter(period=self.period, connection__in=[c.pk for c in connections]).count()
        if already:
            raise actions.Refused(
                f'{already} of these connections already have a bill for {self.period:%B %Y}. '
                'A month is billed once per connection.'
            )
        for connection in connections:
            tariff = connection.tariff
            water = quantize(connection.assessed_monthly_kgal * tariff.rate_per_kgal)
            if water <= 0:
                raise actions.Refused(f'{connection.number} has no assessed consumption, so it can’t be billed.')
            bill = actions.create(ctx, Bill, customer=connection.consumer, issue_date=self.issue_date)
            basis = 'assessed' if connection.billing_basis == 'average' else 'metered'
            actions.create(
                ctx,
                BillLine,
                bill=bill,
                description=f'Water charge, {self.period:%B %Y}, {connection.assessed_monthly_kgal:f} thousand gallons ({basis})',
                quantity=connection.assessed_monthly_kgal,
                unit_price=tariff.rate_per_kgal,
            )
            sewerage = quantize(water * tariff.sewerage_percent / 100)
            if sewerage > 0:
                actions.create(
                    ctx,
                    BillLine,
                    bill=bill,
                    description=f'Sewerage, {tariff.sewerage_percent:f}% of the water charge',
                    quantity=1,
                    unit_price=sewerage,
                )
            actions.create(ctx, ConnectionBill, run=self, connection=connection, period=self.period, bill=bill)

    def post_bills(self, ctx):
        """Post every draft bill in the run, as the person who ran it: they must be allowed to post bills."""
        from billing.models import Bill

        actions.require_grant(ctx, Bill, 'post')
        for item in self.items.select_related('bill').order_by('connection__number'):
            if item.bill.state == 'draft':
                actions.perform_transition(ctx, item.bill, 'post')


class ConnectionBill(ClickerModel):
    """Which bill a run made for which connection and month: the record that a month is billed once."""

    run = models.ForeignKey(BillingRun, on_delete=models.PROTECT, related_name='items')
    connection = models.ForeignKey(Connection, on_delete=models.PROTECT, related_name='bill_links')
    period = models.DateField()
    bill = models.OneToOneField('billing.Bill', on_delete=models.PROTECT, related_name='water_link')

    class Meta:
        ordering = ['run_id', 'connection__number']
        verbose_name = 'connection bill'
        constraints = [
            models.UniqueConstraint(
                fields=['connection', 'period'],
                name='one_bill_per_connection_per_month',
                violation_error_message='This connection already has a bill for that month.',
            )
        ]

    class Schema:
        icon = 'link'
        nav = False
        display_field = 'label'
        system_managed = True
        list_display = ['connection', 'bill', 'period', 'bill_total']
        computed = {
            'bill_total': {
                'label': 'Bill total',
                'type': 'currency',
                'description': 'The total of the bill',
                'requires': ['billing.bill'],
                'expression': over()(lambda context: F('bill__amount_total')),
            }
        }
        default_grants = {BILLING_OFFICER: ['view_connectionbill']}

    @property
    def label(self):
        return f'{self.connection.number}, {self.period:%B %Y}'

    def __str__(self):
        return self.label


# The states in which a consumer is still being chased (a second case can't be opened).
OPEN_CASE_STATES = ['open', 'notice_1', 'notice_2', 'legal', 'instalment', 'disconnection_ordered']


class RecoveryCase(ClickerModel):
    STATE_CHOICES = [
        ('open', 'Open'),
        ('notice_1', 'Notice 1'),
        ('notice_2', 'Notice 2'),
        ('legal', 'Legal'),
        ('instalment', 'Instalment plan'),
        ('settled', 'Settled'),
        ('written_off', 'Written off'),
        ('disconnection_ordered', 'Disconnection ordered'),
    ]

    number = models.CharField(max_length=32, blank=True, editable=False)
    consumer = models.ForeignKey(Contact, on_delete=models.PROTECT, related_name='recovery_cases')
    amount_opened = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        editable=False,
        verbose_name='owed when opened',
        help_text='What the consumer owed the day the case was opened, kept for comparison.',
    )
    owner = models.ForeignKey(
        Staff, null=True, blank=True, on_delete=models.PROTECT, related_name='recovery_cases'
    )
    next_action_date = models.DateField(null=True, blank=True)
    next_action = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    state = models.CharField(max_length=24, choices=STATE_CHOICES, default='open', editable=False)

    class Meta:
        ordering = ['-id']
        verbose_name = 'recovery case'
        indexes = [
            models.Index(fields=['state'], name='case_state'),
            models.Index(fields=['next_action_date'], name='case_next_action'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['consumer'],
                condition=Q(state__in=OPEN_CASE_STATES),
                name='one_open_case_per_consumer',
                violation_error_message='This consumer already has an open recovery case.',
            )
        ]

    class Schema:
        icon = 'siren'
        display_field = 'label'
        restricted_fields = ['owner']
        read_only_fields = ['amount_opened']
        numbering = {'field': 'number', 'prefix': 'RC', 'digits': 5}
        on_save = 'on_save'
        domains = {'consumer': {'is_customer': True}, 'owner': {'active': True, 'role': 'Recovery officer'}}
        # Select cases, choose a recovery officer, done: set one field on many rows (audited each).
        bulk_actions = [{'key': 'assign_owner', 'label': 'Assign owner', 'field': 'owner'}]
        search_fields = ['number', 'next_action']
        field_types = {'amount_opened': 'currency'}
        list_display = ['number', 'consumer', 'state', 'owner', 'outstanding', 'oldest_overdue_days', 'next_action_date']
        list_sort = [{'field': 'next_action_date', 'direction': 'asc'}]
        groups = [
            {'label': 'The case', 'fields': ['number', 'consumer', 'owner']},
            {'label': 'What is owed', 'fields': ['amount_opened', 'outstanding', 'oldest_overdue_days']},
            {'label': 'What happens next', 'fields': ['next_action', 'next_action_date', 'notes']},
        ]
        computed = {
            'outstanding': {
                'label': 'Owed now',
                'type': 'currency',
                'description': 'Everything this consumer owes on posted bills today',
                'requires': ['billing.bill'],
                'expression': customer_outstanding('consumer_id'),
            },
            'oldest_overdue_days': {
                'label': 'Oldest overdue (days)',
                'type': 'integer',
                'description': 'Days since the consumer’s oldest unpaid bill fell due',
                'requires': ['billing.bill'],
                'expression': customer_oldest_overdue_days('consumer_id'),
            },
        }
        record_rules = [{'role': RECOVERY_OFFICER, 'filter': {'owner__user_id': USER}}]
        default_grants = {
            RECOVERY_OFFICER: [
                'view_recoverycase',
                'change_recoverycase',
                'view_recoverycase_owner',
                'notice_1_recoverycase',
                'notice_2_recoverycase',
                'legal_recoverycase',
                'instalment_recoverycase',
                'settle_recoverycase',
            ],
            BILLING_OFFICER: ['view_recoverycase', 'view_recoverycase_owner'],
        }
        summaries = [
            {'label': 'Open cases', 'aggregate': 'count', 'filter': ['state:in:open,notice_1,notice_2,legal,instalment,disconnection_ordered']},
            {
                'label': 'Need an owner',
                'aggregate': 'count',
                'filter': ['owner:empty', 'state:in:open,notice_1,notice_2,legal,instalment,disconnection_ordered'],
            },
            {
                'label': 'Owed on open cases',
                'aggregate': 'sum',
                'field': 'outstanding',
                'filter': ['state:in:open,notice_1,notice_2,legal,instalment,disconnection_ordered'],
            },
        ]
        views = [
            {
                'key': 'needs_owner',
                'label': 'Needs an owner',
                'filters': ['owner:empty', 'state:in:open,notice_1,notice_2,legal,instalment,disconnection_ordered'],
                'ordering': '-outstanding',
            },
            {'key': 'by_stage', 'label': 'By stage', 'group_by': 'state'},
            {'key': 'biggest', 'label': 'Biggest balances', 'ordering': '-outstanding'},
            {'key': 'due_this_month', 'label': 'Next action this month', 'filters': ['next_action_date:preset:this_month']},
        ]
        workflow = {
            'field': 'state',
            'path': ['open', 'notice_1', 'notice_2', 'legal', 'instalment', 'settled'],
            'tones': {
                'notice_1': 'info',
                'notice_2': 'warning',
                'legal': 'warning',
                'instalment': 'info',
                'settled': 'positive',
                'written_off': 'neutral',
                'disconnection_ordered': 'danger',
            },
            'locked': ['settled', 'written_off'],
            'transitions': {
                'notice_1': {'label': 'Send notice 1', 'waiting_verb': 'send the first notice on {this}', 'action': 'send the first notice', 'from': ['open'], 'to': 'notice_1'},
                'notice_2': {'label': 'Send notice 2', 'waiting_verb': 'send the second notice on {this}', 'action': 'send the second notice', 'from': ['notice_1'], 'to': 'notice_2'},
                'legal': {'label': 'Refer to legal', 'waiting_verb': 'refer {this} to legal', 'action': 'refer to legal', 'from': ['notice_2'], 'to': 'legal'},
                'instalment': {
                    'label': 'Agree an instalment plan', 'waiting_verb': 'agree an instalment plan on {this}', 'action': 'agree an instalment plan',
                    'from': ['notice_1', 'notice_2', 'legal'],
                    'to': 'instalment',
                },
                'settle': {
                    'label': 'Mark settled', 'waiting_verb': 'mark {this} settled', 'action': 'mark settled',
                    'from': ['open', 'notice_1', 'notice_2', 'legal', 'instalment'],
                    'to': 'settled',
                    'check': 'check_settled',
                },
                'write_off': {
                    'label': 'Write off',
                    'from': ['notice_2', 'legal', 'instalment'],
                    'to': 'written_off',
                    'check': 'check_written_off',
                    'confirm': 'This case closes. The balance must already have been reduced by approved write-offs.',
                },
                'order_disconnection': {
                    'label': 'Order disconnection', 'waiting_verb': 'order disconnection on {this}', 'action': 'order disconnection',
                    'from': ['notice_2', 'legal', 'instalment'],
                    'to': 'disconnection_ordered',
                    'confirm': 'A Manager orders this. Nothing is disconnected automatically.',
                },
            },
        }

    def clean(self):
        if self.consumer_id and not self.consumer.is_customer:
            raise ValidationError({'consumer': 'Choose a customer: this contact isn’t marked as one.'})

    def on_save(self, ctx, created):
        """The day a case opens, it keeps what the consumer owed, so the story can be told afterwards."""
        if created:
            self.amount_opened = services.customer_outstanding_value(self.consumer_id)
            self.save(update_fields=['amount_opened'])

    @property
    def label(self):
        return f'{self.number} · {self.consumer.name}' if self.number else self.consumer.name

    def __str__(self):
        return self.label

    def _still_owed(self):
        return services.customer_outstanding_value(self.consumer_id)

    def check_settled(self, user):
        owed = self._still_owed()
        if owed > 0:
            return f'{self.consumer.name} still owes {format_money(owed)}. A case is settled when nothing is owed.'
        return None

    def check_written_off(self, user):
        owed = self._still_owed()
        if owed > 0:
            return (
                f'{self.consumer.name} still owes {format_money(owed)}. A write-off is approved '
                'bill by bill, through adjustments, before the case closes.'
            )
        return None
