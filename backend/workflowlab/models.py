from django.conf import settings
from django.db import models

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
    state = models.CharField(max_length=16, choices=STATE_CHOICES, default='draft', editable=False)

    class Meta:
        ordering = ['-id']
        verbose_name = 'lab bill'

    class Schema:
        icon = 'receipt'
        display_field = 'customer'
        field_types = {'amount': 'currency'}
        list_display = ['number', 'customer', 'amount', 'state']
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

    class Schema:
        icon = 'receipt-text'
        display_field = 'reason'
        field_types = {'amount': 'currency'}
        list_display = ['number', 'reason', 'amount', 'state']
        numbering = {'field': 'number', 'prefix': 'ADJ', 'digits': 5}
        workflow = {
            'field': 'state',
            'path': ['draft', 'requested', 'approved'],
            'tones': {'requested': 'warning', 'approved': 'positive', 'rejected': 'danger'},
            'locked': ['requested', 'approved', 'rejected'],
            'transitions': {
                # Its hint is written for it: "This goes to a Manager for approval."
                'request': {
                    'label': 'Request approval',
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
