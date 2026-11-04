"""
The shared receivables core: customer bills, payments allocated oldest-first,
and reductions (corrections, credits, write-offs) that a second person
approves. Journey A (water) and Journey B (clearing) both sit on it.

Money rules, each enforced here and proved by a test:

- A bill's total is recalculated from its lines while it is a Draft, and
  frozen when it is posted. A posted bill is never edited; it is reduced only
  by an approved Adjustment.
- `amount_paid` and `amount_adjusted` are server-owned: only an allocation
  and an approved adjustment change them, in the same transaction as the
  thing that caused it, each with an audit entry that says so.
- A payment is allocated across the customer's open bills oldest-first (due
  date, then number) when it is posted. Rows are locked in that order, so two
  cashiers posting at once cannot over-allocate a bill. What is left over is
  the customer's advance, and is applied to the next bill they are sent.
- A payment's (method, reference) is unique among payments not cancelled:
  the same bank transaction cannot be posted twice.
- Whoever requests an adjustment cannot approve it; above the configured
  threshold a second Manager must.
"""
import datetime
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import (
    Case,
    CharField,
    DecimalField,
    DurationField,
    ExpressionWrapper,
    F,
    IntegerField,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce, ExtractDay, Round
from django.utils import timezone

from core.models import Contact
from foundation import actions
from foundation.computed import over
from foundation.models import ClickerModel
from foundation.money import format_money, money_token, quantize
from foundation.rules import USER

from . import services
from .expressions import BALANCE, MONEY, ZERO, customer_advance, customer_outstanding

RECOVERY_OFFICER = 'Recovery officer'
BILLING_OFFICER = 'Billing officer'
CASHIER = 'Cashier'

# A recovery officer sees only the customers whose case they own, and so only
# those customers' bills, payments and adjustments.
OWN_CUSTOMERS = {'customer__recovery_cases__owner__user_id': USER}


def _open_balance(context):
    return Q(state='posted', amount_total__gt=F('amount_paid') + F('amount_adjusted'))


@over('state', 'amount_total', 'amount_paid', 'amount_adjusted', 'due_date')
def payment_status(context):
    """Paid, overdue, partly paid or not paid, for a posted bill; nothing for a draft or a cancelled one."""
    settled = F('amount_paid') + F('amount_adjusted')
    return Case(
        When(~Q(state='posted'), then=Value(None)),
        When(Q(amount_total__lte=settled), then=Value('paid')),
        When(Q(due_date__lt=context.today), then=Value('overdue')),
        When(Q(amount_paid__gt=0) | Q(amount_adjusted__gt=0), then=Value('partly_paid')),
        default=Value('not_paid'),
        output_field=CharField(),
    )


@over('state', 'amount_total', 'amount_paid', 'amount_adjusted', 'due_date')
def days_overdue(context):
    """Days past the due date (negative before it) while the bill has a balance; empty otherwise."""
    elapsed = ExtractDay(ExpressionWrapper(Value(context.today) - F('due_date'), output_field=DurationField()))
    return Case(When(_open_balance(context), then=elapsed), default=Value(None), output_field=IntegerField())


@over()
def paid_this_month(context):
    """What was collected against this bill by payments dated this month."""
    start = context.today.replace(day=1)
    collected = (
        PaymentAllocation.objects.filter(
            bill=OuterRef('pk'),
            reversed=False,
            payment__state='posted',
            payment__payment_date__gte=start,
            payment__payment_date__lte=context.today,
        )
        .order_by()
        .values('bill')
        .annotate(total=Sum('amount'))
        .values('total')
    )
    return Coalesce(Subquery(collected, output_field=MONEY), ZERO)


class Bill(ClickerModel):
    STATE_CHOICES = [('draft', 'Draft'), ('posted', 'Posted'), ('cancelled', 'Cancelled')]

    number = models.CharField(max_length=32, blank=True, editable=False)
    customer = models.ForeignKey(Contact, on_delete=models.PROTECT, related_name='bills')
    issue_date = models.DateField(default=timezone.localdate)
    due_date = models.DateField(
        null=True, blank=True, help_text='Leave blank to use the customer’s payment terms.'
    )
    amount_total = models.DecimalField(max_digits=14, decimal_places=2, default=0, editable=False)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0, editable=False)
    amount_adjusted = models.DecimalField(max_digits=14, decimal_places=2, default=0, editable=False)
    state = models.CharField(max_length=16, choices=STATE_CHOICES, default='draft', editable=False)

    class Meta:
        ordering = ['-issue_date', '-id']
        indexes = [
            models.Index(fields=['state'], name='bill_state'),
            models.Index(fields=['due_date'], name='bill_due_date'),
            models.Index(fields=['issue_date'], name='bill_issue_date'),
            models.Index(fields=['customer', 'state'], name='bill_customer_state'),
            models.Index(fields=['number'], name='bill_number'),
        ]

    class Schema:
        icon = 'receipt'
        display_field = 'label'
        archive_field = None
        field_types = {'amount_total': 'currency', 'amount_paid': 'currency', 'amount_adjusted': 'currency'}
        domains = {'customer': {'is_customer': True}}
        read_only_fields = ['amount_total', 'amount_paid', 'amount_adjusted']
        numbering = {'field': 'number', 'prefix': 'BILL', 'digits': 5}
        on_save = 'on_save'
        search_fields = ['number']
        list_display = ['number', 'customer', 'issue_date', 'due_date', 'amount_total', 'balance', 'payment_status', 'state']
        list_sort = [{'field': 'issue_date', 'direction': 'desc'}]

        groups = [
            {'label': 'Bill', 'fields': ['number', 'customer', 'issue_date', 'due_date']},
            {
                'label': 'Amounts',
                'fields': ['amount_total', 'amount_paid', 'amount_adjusted', 'balance', 'payment_status', 'days_overdue'],
            },
        ]
        related_lists = [
            {'relation': 'lines', 'label': 'Lines', 'columns': ['description', 'quantity', 'unit_price', 'amount']},
            {'relation': 'allocations', 'label': 'Payments applied', 'columns': ['payment', 'amount', 'reversed']},
            {'relation': 'adjustments', 'label': 'Adjustments', 'columns': ['number', 'kind', 'amount', 'state']},
        ]
        computed = {
            'balance': {
                'label': 'Balance',
                'type': 'currency',
                'expression': BALANCE,
                'description': 'Total − Paid − Adjusted',
            },
            'payment_status': {
                'label': 'Payment status',
                'type': 'selection',
                'expression': payment_status,
                'description': 'Paid, overdue, partly paid or not paid, from what has been paid and the due date',
                'choices': [
                    ('not_paid', 'Not paid'),
                    ('partly_paid', 'Partly paid'),
                    ('paid', 'Paid'),
                    ('overdue', 'Overdue'),
                ],
                'tones': {'not_paid': 'neutral', 'partly_paid': 'info', 'paid': 'positive', 'overdue': 'danger'},
            },
            'days_overdue': {
                'label': 'Days overdue',
                'type': 'integer',
                'expression': days_overdue,
                'description': 'Days past the due date while the bill has a balance, in Karachi time',
                'buckets': [
                    {'label': 'Not yet due', 'max': -1},
                    {'label': '0–30 days', 'min': 0, 'max': 30},
                    {'label': '31–60 days', 'min': 31, 'max': 60},
                    {'label': '61–90 days', 'min': 61, 'max': 90},
                    {'label': '91–180 days', 'min': 91, 'max': 180},
                    {'label': 'Over 180 days', 'min': 181},
                ],
            },
            'paid_this_month': {
                'label': 'Collected this month',
                'type': 'currency',
                'expression': paid_this_month,
                'description': 'Payments allocated to this bill, dated this month',
                'requires': ['billing.paymentallocation'],
                'form': False,
            },
        }
        summaries = [
            {'label': 'Outstanding', 'aggregate': 'sum', 'field': 'balance', 'filter': ['state:in:posted']},
            {'label': 'Overdue', 'aggregate': 'sum', 'field': 'balance', 'filter': ['payment_status:in:overdue']},
            {'label': 'Collected this month', 'aggregate': 'sum', 'field': 'paid_this_month'},
            {'label': 'Bills', 'aggregate': 'count', 'filter': ['state:in:posted']},
        ]
        views = [
            {
                'key': 'aging',
                'label': 'Aging',
                'filters': ['state:in:posted', 'balance:gte:0.01'],
                'group_by': 'days_overdue',
                # Every bucket shows its count and total; the oldest, where the money is, is open.
                'collapsed': ['0', '1', '2', '3', '4'],
                'ordering': '-balance',
            },
            {
                'key': 'overdue_90',
                'label': 'Overdue over 90 days',
                'filters': ['state:in:posted', 'days_overdue:gte:91'],
                'group_by': 'days_overdue',
                'ordering': '-balance',
            },
            {
                'key': 'posted_this_month',
                'label': 'Posted this month',
                'filters': ['state:in:posted', 'issue_date:preset:this_month'],
                'ordering': '-amount_total',
            },
            {'key': 'drafts', 'label': 'Drafts', 'filters': ['state:in:draft'], 'ordering': '-issue_date'},
        ]
        workflow = {
            'field': 'state',
            'path': ['draft', 'posted'],
            'tones': {'posted': 'positive'},
            'locked': ['posted', 'cancelled'],
            'transitions': {
                'post': {
                    'label': 'Post',
                    'from': ['draft'],
                    'to': 'posted',
                    'run': 'freeze',
                    'check': 'check_post',
                    'hint': 'Once posted, it can’t be edited, only reduced by an approved adjustment.',
                },
                'cancel': {
                    'label': 'Cancel',
                    'from': ['draft', 'posted'],
                    'to': 'cancelled',
                    'check': 'check_cancel',
                    'confirm': 'It keeps its number and can’t be posted afterwards.',
                },
            },
        }
        record_rules = [{'role': RECOVERY_OFFICER, 'filter': OWN_CUSTOMERS}]
        default_grants = {
            BILLING_OFFICER: ['view_bill', 'add_bill', 'change_bill', 'post_bill'],
            'Cashier': ['view_bill'],
            RECOVERY_OFFICER: ['view_bill'],
        }

    # ---- validation and defaults

    def clean(self):
        if self.customer_id and not self.customer.is_customer:
            raise ValidationError({'customer': 'Choose a customer: this contact isn’t marked as one.'})

    def on_save(self, ctx, created):
        """A bill with no due date falls due when the customer's payment terms say."""
        if self.due_date is None:
            self.due_date = self.issue_date + datetime.timedelta(days=self.customer.payment_terms_days)
            self.save(update_fields=['due_date'])

    @property
    def label(self):
        return f'{self.number} · {self.customer.name}' if self.number else self.customer.name

    def __str__(self):
        return self.label

    @property
    def balance_value(self):
        return self.amount_total - self.amount_paid - self.amount_adjusted

    # ---- totals

    def recalculate(self, ctx):
        """The total, from the lines, with each line rounded to the paisa. Only while the bill is open to edit."""
        total = sum((line.amount_value for line in self.lines.all()), Decimal('0.00'))
        if total != self.amount_total:
            actions.change(ctx, self, amount_total=total)

    # ---- transitions

    def check_post(self, user):
        if not self.lines.exists():
            return 'Add at least one line before posting.'
        return None

    def freeze(self, ctx):
        """Posting: the total is final, and any advance the customer holds is applied."""
        self.recalculate(ctx)
        self.refresh_from_db()
        if self.amount_total <= 0:
            raise actions.Refused('A bill needs a total above zero to be posted.')
        services.apply_advances(ctx, self)

    def check_cancel(self, user):
        if self.amount_paid or self.amount_adjusted:
            return 'Payments or reductions have been applied to this bill, so it can’t be cancelled.'
        return None


class BillLine(ClickerModel):
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name='lines')
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1, validators=[MinValueValidator(Decimal('0'))])
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0'))])

    class Meta:
        ordering = ['id']
        verbose_name = 'bill line'

    class Schema:
        icon = 'list'
        nav = False
        display_field = 'description'
        field_types = {'unit_price': 'currency'}
        on_save = 'on_save'
        list_display = ['description', 'quantity', 'unit_price', 'amount']
        list_sort = [{'field': 'id', 'direction': 'asc'}]
        computed = {
            'amount': {
                'label': 'Amount',
                'type': 'currency',
                'expression': over('quantity', 'unit_price')(
                    lambda context: Round(F('quantity') * F('unit_price'), 2)
                ),
                'description': 'Quantity × Unit price, to the paisa',
            }
        }
        record_rules = [{'role': RECOVERY_OFFICER, 'filter': {'bill__' + key: value for key, value in OWN_CUSTOMERS.items()}}]
        default_grants = {
            BILLING_OFFICER: ['view_billline', 'add_billline', 'change_billline'],
            'Cashier': ['view_billline'],
            RECOVERY_OFFICER: ['view_billline'],
        }

    def clean(self):
        if self.bill_id and self.bill.state != 'draft':
            raise ValidationError(
                {'bill': f'This bill is {self.bill.get_state_display()}, so its lines can’t be changed.'}
            )

    @property
    def amount_value(self):
        return quantize(self.quantity * self.unit_price)

    def on_save(self, ctx, created):
        """The bill's total follows its lines, under the bill's row lock."""
        bill = Bill.objects.select_for_update().get(pk=self.bill_id)
        bill.recalculate(ctx)

    def __str__(self):
        return self.description


class Payment(ClickerModel):
    STATE_CHOICES = [('draft', 'Draft'), ('posted', 'Posted'), ('cancelled', 'Cancelled')]
    METHOD_CHOICES = [
        ('onelink', '1Link'),
        ('bank_transfer', 'Bank transfer'),
        ('cheque', 'Cheque'),
        ('cash', 'Cash'),
    ]

    number = models.CharField(max_length=32, blank=True, editable=False)
    customer = models.ForeignKey(Contact, on_delete=models.PROTECT, related_name='payments')
    payment_date = models.DateField(default=timezone.localdate)
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    method = models.CharField(max_length=16, choices=METHOD_CHOICES, default='bank_transfer')
    reference = models.CharField(
        max_length=64,
        blank=True,
        help_text='The bank’s own reference. The same reference can’t be posted twice for one method.',
    )
    state = models.CharField(max_length=16, choices=STATE_CHOICES, default='draft', editable=False)

    class Meta:
        ordering = ['-payment_date', '-id']
        indexes = [
            models.Index(fields=['state'], name='payment_state'),
            models.Index(fields=['payment_date'], name='payment_date'),
            models.Index(fields=['customer', 'state'], name='payment_customer_state'),
        ]
        constraints = [
            # The idempotency key: one bank transaction, one payment. A payment
            # that was cancelled (keyed wrongly, say) frees its reference.
            models.UniqueConstraint(
                fields=['method', 'reference'],
                condition=~Q(reference='') & ~Q(state='cancelled'),
                name='payment_reference_once_per_method',
                violation_error_message='A payment with this reference has already been recorded for this method.',
            )
        ]

    class Schema:
        icon = 'banknote'
        display_field = 'label'
        field_types = {'amount': 'currency'}
        domains = {'customer': {'is_customer': True}}
        numbering = {'field': 'number', 'prefix': 'PAY', 'digits': 5}
        search_fields = ['number', 'reference']
        list_display = ['number', 'customer', 'payment_date', 'method', 'reference', 'amount', 'advance', 'state']
        list_sort = [{'field': 'payment_date', 'direction': 'desc'}]
        groups = [
            {'label': 'Payment', 'fields': ['number', 'customer', 'payment_date', 'amount']},
            {'label': 'How it was paid', 'fields': ['method', 'reference']},
            {'label': 'Where it went', 'fields': ['allocated', 'advance']},
        ]
        related_lists = [{'relation': 'allocations', 'label': 'Allocated to', 'columns': ['bill', 'amount', 'reversed']}]
        computed = {
            'allocated': {
                'label': 'Allocated to bills',
                'type': 'currency',
                'description': 'The part of this payment applied to bills',
                'requires': ['billing.paymentallocation'],
                'expression': over('amount')(
                    lambda context: Coalesce(
                        Subquery(
                            PaymentAllocation.objects.filter(payment=OuterRef('pk'), reversed=False)
                            .order_by()
                            .values('payment')
                            .annotate(total=Sum('amount'))
                            .values('total'),
                            output_field=MONEY,
                        ),
                        ZERO,
                    )
                ),
            },
            'advance': {
                'label': 'Advance',
                'type': 'currency',
                'description': 'What is left of a posted payment after it was applied to bills: money the customer holds with us',
                'requires': ['billing.paymentallocation'],
                'expression': over('amount', 'state')(
                    lambda context: Case(
                        When(
                            state='posted',
                            then=F('amount')
                            - Coalesce(
                                Subquery(
                                    PaymentAllocation.objects.filter(payment=OuterRef('pk'), reversed=False)
                                    .order_by()
                                    .values('payment')
                                    .annotate(total=Sum('amount'))
                                    .values('total'),
                                    output_field=MONEY,
                                ),
                                ZERO,
                            ),
                        ),
                        default=ZERO,
                        output_field=MONEY,
                    )
                ),
            },
        }
        summaries = [
            {
                'label': 'Posted this month',
                'aggregate': 'sum',
                'field': 'amount',
                'filter': ['state:in:posted', 'payment_date:preset:this_month'],
            },
            {'label': 'Held as advance', 'aggregate': 'sum', 'field': 'advance'},
            {'label': 'Payments', 'aggregate': 'count', 'filter': ['state:in:posted']},
        ]
        views = [
            {'key': 'this_month', 'label': 'Posted this month', 'filters': ['state:in:posted', 'payment_date:preset:this_month']},
            {'key': 'advances', 'label': 'Held as advance', 'filters': ['advance:gte:0.01'], 'ordering': '-advance'},
            {'key': 'by_method', 'label': 'By method', 'filters': ['state:in:posted'], 'group_by': 'method'},
        ]
        workflow = {
            'field': 'state',
            'path': ['draft', 'posted'],
            'tones': {'posted': 'positive'},
            'locked': ['posted', 'cancelled'],
            'transitions': {
                'post': {
                    'label': 'Post',
                    'from': ['draft'],
                    'to': 'posted',
                    'run': 'allocate',
                    'hint': 'It is applied to the customer’s oldest bills first. Anything left stays with them as an advance.',
                },
                'cancel': {
                    'label': 'Cancel',
                    'from': ['draft', 'posted'],
                    'to': 'cancelled',
                    'run': 'reverse',
                    'confirm': 'Everything it was applied to is owed again, and the reference can be used once more.',
                },
            },
        }
        record_rules = [{'role': RECOVERY_OFFICER, 'filter': OWN_CUSTOMERS}]
        default_grants = {
            CASHIER: ['view_payment', 'add_payment', 'change_payment', 'post_payment'],
            BILLING_OFFICER: ['view_payment'],
            RECOVERY_OFFICER: ['view_payment'],
        }

    def clean(self):
        if self.customer_id and not self.customer.is_customer:
            raise ValidationError({'customer': 'Choose a customer: this contact isn’t marked as one.'})
        if self.method != 'cash' and not self.reference.strip():
            raise ValidationError({'reference': 'Enter the bank’s reference, so this payment can’t be posted twice.'})
        if self.reference and self.state != 'cancelled':
            clash = Payment.objects.filter(method=self.method, reference=self.reference).exclude(state='cancelled')
            if self.pk:
                clash = clash.exclude(pk=self.pk)
            if clash.exists():
                raise ValidationError(
                    {'reference': 'A payment with this reference has already been recorded for this method.'}
                )

    @property
    def label(self):
        return f'{self.number} · {self.customer.name}' if self.number else self.customer.name

    def __str__(self):
        return self.label

    def allocate(self, ctx):
        services.allocate_payment(ctx, self)

    def reverse(self, ctx):
        services.reverse_payment(ctx, self)


class PaymentAllocation(ClickerModel):
    """How much of a payment went to one bill. Written only by posting and cancelling a payment."""

    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name='allocations')
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name='allocations')
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    reversed = models.BooleanField(default=False, editable=False)

    class Meta:
        ordering = ['payment_id', 'bill_id']
        verbose_name = 'payment allocation'
        indexes = [models.Index(fields=['payment', 'reversed'], name='alloc_payment')]

    class Schema:
        icon = 'split'
        nav = False
        display_field = 'label'
        system_managed = True
        field_types = {'amount': 'currency'}
        read_only_fields = ['reversed']
        list_display = ['payment', 'bill', 'amount', 'reversed']
        record_rules = [{'role': RECOVERY_OFFICER, 'filter': {'bill__' + key: value for key, value in OWN_CUSTOMERS.items()}}]
        default_grants = {
            CASHIER: ['view_paymentallocation'],
            BILLING_OFFICER: ['view_paymentallocation'],
            RECOVERY_OFFICER: ['view_paymentallocation'],
        }

    @property
    def label(self):
        return f'{self.payment.number} → {self.bill.number}'

    def __str__(self):
        return self.label


class Adjustment(ClickerModel):
    """
    A reduction of a posted bill: a correction, a credit or a write-off. A
    Billing officer requests it; a Manager who is not the requester approves
    it (two Managers above the threshold), and only then does the bill's
    balance fall.
    """

    KIND_CHOICES = [('correction', 'Correction'), ('credit', 'Credit'), ('write_off', 'Write-off')]
    STATE_CHOICES = [
        ('draft', 'Draft'),
        ('requested', 'Requested'),
        ('approved_once', 'Needs a second approver'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    number = models.CharField(max_length=32, blank=True, editable=False)
    bill = models.ForeignKey(Bill, on_delete=models.PROTECT, related_name='adjustments')
    customer = models.ForeignKey(
        Contact, on_delete=models.PROTECT, related_name='adjustments', null=True, blank=True, editable=False
    )
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default='correction')
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    reason = models.TextField(help_text='What an approver needs to know to say yes.')
    state = models.CharField(max_length=16, choices=STATE_CHOICES, default='draft', editable=False)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        editable=False,
        on_delete=models.PROTECT,
        related_name='+',
        verbose_name='requester',
    )
    first_approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        editable=False,
        on_delete=models.PROTECT,
        related_name='+',
        verbose_name='first approver',
    )

    class Meta:
        ordering = ['-id']
        indexes = [
            models.Index(fields=['state'], name='adjustment_state'),
            models.Index(fields=['customer'], name='adjustment_customer'),
        ]

    class Schema:
        icon = 'receipt-text'
        display_field = 'label'
        field_types = {'amount': 'currency'}
        read_only_fields = ['customer', 'requested_by', 'first_approver']
        numbering = {'field': 'number', 'prefix': 'ADJ', 'digits': 5}
        on_save = 'on_save'
        search_fields = ['number']
        list_display = ['number', 'bill', 'customer', 'kind', 'amount', 'state']
        # What an approver reads, top to bottom: the bill and who owes it, what
        # they owe, what is asked and why, who asked, and what it does to the balance.
        groups = [
            {
                'label': 'What is being reduced',
                'fields': ['number', 'bill', 'customer', 'bill_days_overdue', 'customer_outstanding'],
            },
            {'label': 'The request', 'fields': ['kind', 'amount', 'reason', 'requested_by', 'first_approver']},
            {'label': 'What it does', 'fields': ['balance_before', 'balance_after']},
        ]
        computed = {
            'bill_days_overdue': {
                'label': 'Bill days overdue',
                'type': 'integer',
                'description': 'Days since the bill fell due',
                'expression': over()(
                    lambda context: ExtractDay(
                        ExpressionWrapper(Value(context.today) - F('bill__due_date'), output_field=DurationField())
                    )
                ),
                'requires': ['billing.bill'],
            },
            'customer_outstanding': {
                'label': 'Customer owes in all',
                'type': 'currency',
                'description': 'Everything this customer owes on posted bills',
                'expression': customer_outstanding('customer_id'),
                'requires': ['billing.bill'],
            },
            'balance_before': {
                'label': 'Bill balance before',
                'type': 'currency',
                'description': 'The bill’s balance without this reduction',
                'expression': over('amount', 'state')(
                    lambda context: Case(
                        When(state='approved', then=_bill_balance() + F('amount')),
                        default=_bill_balance(),
                        output_field=MONEY,
                    )
                ),
                'requires': ['billing.bill'],
            },
            'balance_after': {
                'label': 'Bill balance after',
                'type': 'currency',
                'description': 'The bill’s balance with this reduction applied',
                'expression': over('amount', 'state')(
                    lambda context: Case(
                        When(state='approved', then=_bill_balance()),
                        default=_bill_balance() - F('amount'),
                        output_field=MONEY,
                    )
                ),
                'requires': ['billing.bill'],
            },
        }
        summaries = [
            {
                'label': 'Waiting for approval',
                'aggregate': 'sum',
                'field': 'amount',
                'filter': ['state:in:requested,approved_once'],
            },
            {'label': 'Approved', 'aggregate': 'sum', 'field': 'amount', 'filter': ['state:in:approved']},
            {'label': 'Adjustments', 'aggregate': 'count'},
        ]
        views = [
            {
                'key': 'waiting',
                'label': 'Waiting for approval',
                'filters': ['state:in:requested,approved_once'],
                'ordering': '-amount',
            },
            {'key': 'by_state', 'label': 'By state', 'group_by': 'state'},
            {'key': 'write_offs', 'label': 'Write-offs', 'filters': ['kind:in:write_off'], 'ordering': '-amount'},
        ]
        workflow = {
            'field': 'state',
            'path': ['draft', 'requested', 'approved'],
            'tones': {'requested': 'warning', 'approved_once': 'warning', 'approved': 'positive', 'rejected': 'danger'},
            'locked': ['requested', 'approved_once', 'approved', 'rejected'],
            'transitions': {
                'request': {
                    'label': 'Request approval',
                    'from': ['draft'],
                    'to': 'requested',
                    'records_actor': 'requested_by',
                },
                'approve': {
                    'label': 'Approve',
                    'from': ['requested'],
                    'to': 'approved',
                    'not_by': 'requested_by',
                    'when': 'needs_one_approver',
                    'check': 'check_apply',
                    'run': 'apply',
                    'unavailable': 'This reduction is above the limit for one approver. It needs two.',
                },
                'approve_first': {
                    'label': 'Approve',
                    'from': ['requested'],
                    'to': 'approved_once',
                    'not_by': 'requested_by',
                    'records_actor': 'first_approver',
                    'when': 'needs_two_approvers',
                    'hint': 'It is above the limit for one approver, so a second Manager has to approve it too.',
                    'unavailable': 'This reduction needs only one approver.',
                },
                'approve_second': {
                    'label': 'Approve',
                    'from': ['approved_once'],
                    'to': 'approved',
                    'not_by': ['requested_by', 'first_approver'],
                    'check': 'check_apply',
                    'run': 'apply',
                },
                'reject': {
                    'label': 'Reject',
                    'from': ['requested', 'approved_once'],
                    'to': 'rejected',
                    'not_by': 'requested_by',
                    'confirm': 'The requester will see it was rejected. It can’t be requested again.',
                },
            },
        }
        record_rules = [{'role': RECOVERY_OFFICER, 'filter': OWN_CUSTOMERS}]
        default_grants = {
            BILLING_OFFICER: ['view_adjustment', 'add_adjustment', 'change_adjustment', 'request_adjustment'],
            RECOVERY_OFFICER: ['view_adjustment'],
        }

    # ---- validation

    def clean(self):
        if not self.bill_id:
            return
        if self.state in ('draft',) and self.bill.state != 'posted':
            raise ValidationError({'bill': f'Only a posted bill can be reduced. This one is {self.bill.get_state_display()}.'})
        if self.state == 'draft' and self.amount is not None and self.amount > self.bill.balance_value:
            raise ValidationError(
                {'amount': f'Can’t be more than the bill’s balance, {format_money(self.bill.balance_value)}.'}
            )

    def on_save(self, ctx, created):
        """The customer is whoever owes the bill: never typed, so it can't disagree with it."""
        if self.customer_id != self.bill.customer_id:
            self.customer_id = self.bill.customer_id
            self.save(update_fields=['customer'])

    @property
    def label(self):
        return f'{self.number} · {self.get_kind_display()}' if self.number else self.get_kind_display()

    def __str__(self):
        return self.label

    # ---- approval

    def _threshold(self):
        return getattr(settings, 'CLICKER_REDUCTION_SECOND_APPROVER_THRESHOLD', None)

    def needs_two_approvers(self):
        threshold = self._threshold()
        return threshold is not None and self.amount > Decimal(threshold)

    def needs_one_approver(self):
        return not self.needs_two_approvers()

    def check_apply(self, user):
        bill = Bill.objects.get(pk=self.bill_id)
        if bill.state != 'posted':
            return f'This bill is {bill.get_state_display()}, so it can no longer be reduced.'
        if self.amount > bill.balance_value:
            return (
                f'The bill’s balance is now {format_money(bill.balance_value)}, less than this reduction. '
                'Reject it and request a new one.'
            )
        return None

    def apply(self, ctx):
        """Approving: the bill's balance falls by the amount, in the same transaction."""
        bill = Bill.objects.select_for_update().get(pk=self.bill_id)
        reason = self.check_apply(ctx.user)
        if reason:
            raise actions.Refused(reason)
        actions.change(
            ctx,
            bill,
            summary=f'Adjustment {self.number} reduced the balance by {money_token(self.amount)}',
            amount_adjusted=bill.amount_adjusted + self.amount,
        )


def _bill_balance():
    return F('bill__amount_total') - F('bill__amount_paid') - F('bill__amount_adjusted')
