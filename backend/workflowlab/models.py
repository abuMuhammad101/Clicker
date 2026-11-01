from django.conf import settings
from django.db import models

from foundation.models import ClickerModel


class LabDocument(ClickerModel):
    """
    One document that exercises every S-3 rule: a number assigned on create,
    a state only transitions move, a posted state that refuses edits, and a
    reduction-style request that its requester can't approve.
    """

    DRAFT, REQUESTED, APPROVED, REJECTED, POSTED, CANCELLED = (
        'draft', 'requested', 'approved', 'rejected', 'posted', 'cancelled'
    )
    STATE_CHOICES = [
        (DRAFT, 'Draft'),
        (REQUESTED, 'Requested'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
        (POSTED, 'Posted'),
        (CANCELLED, 'Cancelled'),
    ]

    number = models.CharField(max_length=32, blank=True, editable=False)
    title = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    state = models.CharField(max_length=16, choices=STATE_CHOICES, default=DRAFT, editable=False)
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

    class Schema:
        icon = 'flask-conical'
        display_field = 'title'
        field_types = {'amount': 'currency'}
        numbering = {'field': 'number', 'prefix': 'LAB', 'digits': 5}
        workflow = {
            'field': 'state',
            # Anything past draft is a record of what happened: reversed, never edited.
            'locked': ['requested', 'approved', 'rejected', 'posted', 'cancelled'],
            'transitions': {
                'post': {'label': 'Post', 'from': ['draft'], 'to': 'posted'},
                'cancel': {
                    'label': 'Cancel',
                    'from': ['draft'],
                    'to': 'cancelled',
                    'confirm': 'Cancel this document? It can’t be posted afterwards.',
                },
                'request': {
                    'label': 'Request approval',
                    'from': ['draft'],
                    'to': 'requested',
                    'records_actor': 'requested_by',
                },
                'approve': {'label': 'Approve', 'from': ['requested'], 'to': 'approved', 'not_by': 'requested_by'},
                'reject': {'label': 'Reject', 'from': ['requested'], 'to': 'rejected', 'not_by': 'requested_by'},
            },
        }
        # The proposed defaults for Hassan's S-3 questions, drafted here:
        # a Clerk drafts, posts and requests; only a Manager cancels, approves
        # or rejects (and never their own request: not_by above).
        default_grants = {
            'Clerk': [
                'view_labdocument',
                'add_labdocument',
                'change_labdocument',
                'post_labdocument',
                'request_labdocument',
            ],
        }

    def __str__(self):
        return self.title
