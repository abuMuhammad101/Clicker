from django.conf import settings
from django.contrib.postgres.indexes import GinIndex, OpClass
from django.db import models
from django.db.models.functions import Upper

from foundation.computed import days_since
from foundation.models import ClickerModel


class LabBill(ClickerModel):
    """
    The shape of S-5's bills: numbered on create, posted by a Clerk, cancelled
    only by a Manager, and never edited once it's out of draft.
    """

    STATE_CHOICES = [('draft', 'Draft'), ('posted', 'Posted'), ('cancelled', 'Cancelled')]

    number = models.CharField(max_length=32, blank=True, editable=False)
    customer = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    issued_on = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    state = models.CharField(max_length=16, choices=STATE_CHOICES, default='draft', editable=False)

    class Meta:
        ordering = ['-id']
        verbose_name = 'lab bill'
        # What the Schema below sorts, filters, groups and searches by.
        indexes = [
            models.Index(fields=['state'], name='labbill_state'),
            models.Index(fields=['due_date'], name='labbill_due_date'),
            models.Index(fields=['issued_on'], name='labbill_issued_on'),
            models.Index(fields=['amount'], name='labbill_amount'),
            models.Index(fields=['number'], name='labbill_number'),
            GinIndex(OpClass(Upper('customer'), name='gin_trgm_ops'), name='labbill_customer_trgm'),
            GinIndex(OpClass(Upper('number'), name='gin_trgm_ops'), name='labbill_number_trgm'),
        ]

    class Schema:
        icon = 'receipt'
        display_field = 'customer'
        field_types = {'amount': 'currency'}
        list_display = ['number', 'customer', 'issued_on', 'due_date', 'amount', 'days_overdue', 'state']
        search_fields = ['number', 'customer']
        computed = {
            # Today-dependent: recalculated on every read, in Karachi time.
            'days_overdue': {
                'label': 'Days overdue',
                'type': 'integer',
                'expression': days_since('due_date'),
                'buckets': [
                    {'label': 'Not yet due', 'max': -1},
                    {'label': '0–30 days', 'min': 0, 'max': 30},
                    {'label': '31–60 days', 'min': 31, 'max': 60},
                    {'label': '61–90 days', 'min': 61, 'max': 90},
                    {'label': '90+ days', 'min': 91},
                ],
            },
        }
        # The strip above the list: over whatever the list is filtered to.
        summaries = [
            {'label': 'Outstanding', 'aggregate': 'sum', 'field': 'amount', 'filter': ['state:in:posted']},
            {
                'label': 'Overdue',
                'aggregate': 'sum',
                'field': 'amount',
                'filter': ['state:in:posted', 'days_overdue:gte:1'],
            },
            {
                'label': 'Posted this month',
                'aggregate': 'sum',
                'field': 'amount',
                'filter': ['state:in:posted', 'issued_on:preset:this_month'],
            },
            {'label': 'Bills', 'aggregate': 'count'},
        ]
        views = [
            {
                'key': 'aging',
                'label': 'Aging',
                'filters': ['state:in:posted'],
                'group_by': 'days_overdue',
                'ordering': '-amount',
            },
            {
                'key': 'overdue_90',
                'label': 'Overdue over 90 days',
                'filters': ['state:in:posted', 'days_overdue:gte:91'],
                'group_by': 'days_overdue',
                'ordering': '-amount',
            },
            {'key': 'drafts', 'label': 'Drafts', 'filters': ['state:in:draft'], 'ordering': '-issued_on'},
        ]
        numbering = {'field': 'number', 'prefix': 'BILL', 'digits': 5}
        workflow = {
            'field': 'state',
            'path': ['draft', 'posted'],
            'tones': {'posted': 'positive'},
            # Out of draft, a bill is a record of what happened: reversed, never edited.
            'locked': ['posted', 'cancelled'],
            'transitions': {
                'post': {
                    'label': 'Post',
                    'from': ['draft'],
                    'to': 'posted',
                    'hint': 'Once posted, it can’t be edited, only reversed.',
                },
                'cancel': {
                    'label': 'Cancel',
                    'from': ['draft'],
                    'to': 'cancelled',
                    'confirm': 'It keeps its number and can’t be posted afterwards.',
                },
            },
        }
        default_grants = {
            'Clerk': ['view_labbill', 'add_labbill', 'change_labbill', 'post_labbill'],
        }

    def __str__(self):
        return self.customer


class LabAdjustment(ClickerModel):
    """
    The shape of S-5's reductions (credit notes, write-offs, discounts): a
    Clerk requests one, a Manager who isn't the requester approves or rejects.
    """

    STATE_CHOICES = [
        ('draft', 'Draft'),
        ('requested', 'Requested'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    number = models.CharField(max_length=32, blank=True, editable=False)
    reason = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
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

    class Meta:
        ordering = ['-id']
        verbose_name = 'lab adjustment'
        indexes = [
            models.Index(fields=['state'], name='labadjustment_state'),
            models.Index(fields=['amount'], name='labadjustment_amount'),
            models.Index(fields=['number'], name='labadjustment_number'),
            GinIndex(OpClass(Upper('reason'), name='gin_trgm_ops'), name='labadjustment_reason_trgm'),
        ]

    class Schema:
        icon = 'receipt-text'
        display_field = 'reason'
        field_types = {'amount': 'currency'}
        list_display = ['number', 'reason', 'amount', 'state']
        search_fields = ['number', 'reason']
        summaries = [
            {'label': 'Waiting for approval', 'aggregate': 'sum', 'field': 'amount', 'filter': ['state:in:requested']},
            {'label': 'Approved', 'aggregate': 'sum', 'field': 'amount', 'filter': ['state:in:approved']},
            {'label': 'Adjustments', 'aggregate': 'count'},
        ]
        views = [
            {'key': 'waiting', 'label': 'Waiting for approval', 'filters': ['state:in:requested'], 'ordering': '-amount'},
            {'key': 'by_state', 'label': 'By state', 'group_by': 'state'},
        ]
        numbering = {'field': 'number', 'prefix': 'ADJ', 'digits': 5}
        workflow = {
            'field': 'state',
            'path': ['draft', 'requested', 'approved'],
            'tones': {'requested': 'warning', 'approved': 'positive', 'rejected': 'danger'},
            'locked': ['requested', 'approved', 'rejected'],
            'transitions': {
                # Its hint is written for it: "This goes to a Manager for approval."
                'request': {
                    'label': 'Request approval', 'waiting_verb': 'request approval for {this}',
                    'from': ['draft'],
                    'to': 'requested',
                    'records_actor': 'requested_by',
                },
                'approve': {'label': 'Approve', 'from': ['requested'], 'to': 'approved', 'not_by': 'requested_by'},
                'reject': {
                    'label': 'Reject',
                    'from': ['requested'],
                    'to': 'rejected',
                    'not_by': 'requested_by',
                    'confirm': 'The requester will see it was rejected. It can’t be requested again.',
                },
            },
        }
        # Drafted answers to the S-3 questions: a Clerk drafts and requests;
        # only a Manager approves or rejects, and never their own request.
        default_grants = {
            'Clerk': ['view_labadjustment', 'add_labadjustment', 'change_labadjustment', 'request_labadjustment'],
        }

    def __str__(self):
        return self.reason
