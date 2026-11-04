"""
Journey B: a port clearing agency in Karachi. A client's consignment is a Job
that moves through customs stages; its containers run a free-days countdown
(after it, demurrage accrues); the agency pays money out on the client's behalf
(disbursements) and bills it back at cost. At gate-out the invoice drafts
itself through the shared billing core.
"""
import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from billing.models import Bill
from core.models import Contact, Staff
from foundation import actions
from foundation.models import ClickerModel
from foundation.money import format_money
from foundation.rules import USER

from . import expressions as ex
from .services import draft_invoice, release_disbursements

OWNER = 'Owner'
COORDINATOR = 'Coordinator'
DOCUMENTATION = 'Documentation'
FIELD_AGENT = 'Field agent'
ACCOUNTS = 'Accounts'

TERMINALS = [('kict', 'KICT'), ('pict', 'PICT'), ('kpt_east', 'KPT East Wharf')]

CONTAINER_NUMBER = re.compile(r'^[A-Z]{4}\d{7}$')


def _today():
    from foundation import computed

    return computed.today()


class Job(ClickerModel):
    STATE_CHOICES = [
        ('booked', 'Booked'),
        ('documents_in', 'Documents in'),
        ('gd_filed', 'GD filed'),
        ('assessed', 'Assessed'),
        ('duty_paid', 'Duty paid'),
        ('examined', 'Examined'),
        ('released', 'Released'),
        ('gate_out', 'Gate-out'),
        ('closed', 'Closed'),
        ('cancelled', 'Cancelled'),
    ]

    number = models.CharField(max_length=32, blank=True, editable=False)
    client = models.ForeignKey(Contact, on_delete=models.PROTECT, related_name='jobs')
    reference = models.CharField(max_length=64, blank=True, verbose_name='client reference', help_text='The client’s PO number or their own reference.')
    bl_number = models.CharField(max_length=40, blank=True, verbose_name='bill of lading')
    vessel = models.CharField(max_length=80, blank=True)
    terminal = models.CharField(max_length=12, choices=TERMINALS, blank=True)
    goods = models.CharField(max_length=160, blank=True)
    port_of_origin = models.CharField(max_length=80, blank=True)
    assigned_to = models.ForeignKey(
        Staff, null=True, blank=True, on_delete=models.PROTECT, related_name='jobs', verbose_name='field agent'
    )
    service_fee = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)],
        help_text='The agency’s own charge. Disbursements are billed on top, at cost.',
    )
    eta = models.DateField(null=True, blank=True, verbose_name='ETA')
    notes = models.TextField(blank=True)
    invoice = models.OneToOneField(
        Bill, null=True, blank=True, editable=False, on_delete=models.PROTECT, related_name='job',
        help_text='Drafted when the job goes out of the gate; never typed.',
    )
    stage_since = models.DateField(default=_today, editable=False)
    state = models.CharField(max_length=16, choices=STATE_CHOICES, default='booked', editable=False)

    class Meta:
        ordering = ['-id']
        indexes = [
            models.Index(fields=['state'], name='job_state'),
            models.Index(fields=['client'], name='job_client'),
        ]

    class Schema:
        icon = 'ship'
        display_field = 'label'
        numbering = {'field': 'number', 'prefix': 'JOB', 'digits': 4}
        on_save = 'on_save'
        restricted_fields = ['service_fee', 'invoice']
        read_only_fields = ['invoice', 'stage_since']
        # Chips drawn beside the state in the record's header: what the person must see before anything else.
        header_fields = ['demurrage_status']
        field_types = {'service_fee': 'currency'}
        domains = {'client': {'is_customer': True}, 'assigned_to': {'active': True, 'role': FIELD_AGENT}}
        empty_groups = ['state']
        search_fields = ['number', 'reference', 'bl_number', 'vessel', 'goods']
        list_display = [
            'number', 'client', 'goods', 'state', 'demurrage_status', 'demurrage_next_deadline',
            'assigned_to', 'days_in_stage', 'billable_total',
        ]
        list_sort = [{'field': 'number', 'direction': 'desc'}]
        groups = [
            {'label': 'The job', 'fields': ['number', 'client', 'reference', 'goods', 'assigned_to']},
            {'label': 'The consignment', 'fields': ['bl_number', 'vessel', 'terminal', 'port_of_origin', 'eta']},
            {
                'label': 'Where it stands',
                'fields': ['demurrage_status', 'demurrage_next_deadline', 'containers_count', 'stage_since', 'days_in_stage'],
            },
            {'label': 'Money', 'fields': ['service_fee', 'disbursements_total', 'billable_total', 'invoice']},
            {'label': 'Notes', 'fields': ['notes']},
        ]
        related_lists = [
            {
                'relation': 'containers',
                'label': 'Containers',
                'columns': ['number', 'size', 'deadline_status', 'days_left', 'free_until', 'demurrage_accrued'],
            },
            {
                'relation': 'disbursements',
                'label': 'Disbursements',
                'columns': ['kind', 'amount', 'paid_on', 'receipt_ref', 'billable', 'state'],
            },
        ]
        related_lists_after = 'The consignment'
        computed = {
            'containers_count': {
                'label': 'Containers',
                'type': 'integer',
                'description': 'How many containers this job has',
                'expression': ex.job_containers_count,
                'requires': ['clearance.container'],
            },
            'demurrage_next_deadline': {
                'label': 'Deadline',
                'type': 'date',
                'description': 'The earliest last free day among containers still inside the port',
                'expression': ex.job_next_deadline,
                'requires': ['clearance.container'],
            },
            'demurrage_status': {
                'label': 'Demurrage',
                'type': 'selection',
                'description': 'The most urgent container: how many free days it has left',
                'expression': ex.job_demurrage_status,
                'requires': ['clearance.container'],
                'choices': ex.DEADLINE_CHOICES,
                'tones': ex.DEADLINE_TONES,
            },
            'disbursements_total': {
                'label': 'Paid out',
                'type': 'currency',
                'description': 'Everything paid out on this job so far, billable or not',
                'expression': ex.job_disbursements_total,
                'requires': ['clearance.disbursement.amount'],
            },
            'billable_total': {
                'label': 'To be invoiced',
                'type': 'currency',
                'description': 'Service fee plus billable disbursements already approved',
                'expression': ex.job_billable_total,
                'requires': ['clearance.disbursement.amount'],
            },
            'days_in_stage': {
                'label': 'Days in stage',
                'type': 'integer',
                'description': 'Days since the job reached its current stage (open jobs only)',
                'expression': ex.job_days_in_stage,
            },
        }
        summaries = [
            {'label': 'Open jobs', 'aggregate': 'count', 'filter': ['state:in:booked,documents_in,gd_filed,assessed,duty_paid,examined,released,gate_out']},
            {'label': 'At risk', 'aggregate': 'count', 'filter': ['demurrage_status:in:urgent,accruing']},
            {'label': 'To be invoiced', 'aggregate': 'sum', 'field': 'billable_total', 'filter': ['state:in:released,gate_out']},
            {'label': 'Paid out, open jobs', 'aggregate': 'sum', 'field': 'disbursements_total', 'filter': ['state:in:booked,documents_in,gd_filed,assessed,duty_paid,examined,released,gate_out']},
        ]
        views = [
            {
                'key': 'by_stage',
                'label': 'Jobs by stage',
                'group_by': 'state',
                'filters': ['state:in:booked,documents_in,gd_filed,assessed,duty_paid,examined,released,gate_out'],
                'columns': ['number', 'client', 'goods', 'demurrage_status', 'demurrage_next_deadline', 'assigned_to', 'days_in_stage', 'billable_total'],
                # The early stages are just counts and sums; the stages where the money and the risk are stay open.
                'collapsed': ['booked', 'documents_in', 'gd_filed', 'gate_out'],
                'ordering': 'number',
            },
            {
                'key': 'at_risk',
                'label': 'Demurrage at risk',
                'filters': ['demurrage_status:in:soon,urgent,accruing', 'state:in:booked,documents_in,gd_filed,assessed,duty_paid,examined,released'],
                'columns': ['number', 'client', 'state', 'demurrage_status', 'demurrage_next_deadline', 'assigned_to', 'billable_total'],
                'ordering': 'demurrage_next_deadline',
            },
            {
                'key': 'closed',
                'label': 'Closed',
                'filters': ['state:in:closed'],
                'ordering': '-number',
            },
        ]
        workflow = {
            'field': 'state',
            'path': ['booked', 'documents_in', 'gd_filed', 'assessed', 'duty_paid', 'examined', 'released', 'gate_out', 'closed'],
            'tones': {
                'documents_in': 'info', 'gd_filed': 'info', 'assessed': 'warning', 'duty_paid': 'warning',
                'examined': 'warning', 'released': 'positive', 'gate_out': 'positive', 'closed': 'neutral',
                'cancelled': 'neutral',
            },
            'locked': ['closed', 'cancelled'],
            'transitions': {
                'documents_in': {'label': 'Documents received', 'from': ['booked'], 'to': 'documents_in', 'run': 'entered'},
                'file_gd': {'label': 'File GD', 'from': ['documents_in'], 'to': 'gd_filed', 'run': 'entered'},
                'assess': {'label': 'Record assessment', 'from': ['gd_filed'], 'to': 'assessed', 'run': 'entered'},
                'pay_duty': {'label': 'Duty paid', 'from': ['assessed'], 'to': 'duty_paid', 'run': 'entered'},
                'examine': {'label': 'Examined', 'from': ['duty_paid'], 'to': 'examined', 'run': 'entered'},
                'release': {
                    'label': 'Release',
                    'from': ['duty_paid', 'examined'],
                    'to': 'released',
                    'run': 'entered',
                    'hint': 'A green-channel job can be released straight after duty is paid, without an examination.',
                },
                'gate_out': {
                    'label': 'Gate out',
                    'from': ['released'],
                    'to': 'gate_out',
                    'run': 'drafts_the_invoice',
                    'confirm_with': 'confirm_gate_out',
                    'hint': 'Drafts the client’s invoice from the service fee and the approved disbursements.',
                },
                'close': {
                    'label': 'Close job',
                    'from': ['gate_out'],
                    'to': 'closed',
                    'check': 'check_close',
                    'run': 'entered',
                },
                'cancel': {
                    'label': 'Cancel job',
                    'from': ['booked', 'documents_in', 'gd_filed', 'assessed', 'duty_paid', 'examined', 'released', 'gate_out'],
                    'to': 'cancelled',
                    'check': 'check_cancel',
                    'run': 'withdraw_the_draft',
                    'confirm': 'The job is closed without being billed. A draft invoice, if there is one, is cancelled.',
                },
            },
        }
        record_rules = [{'role': FIELD_AGENT, 'filter': {'assigned_to__user_id': USER}}]
        default_grants = {
            COORDINATOR: [
                'view_job', 'add_job', 'change_job',
                'view_job_service_fee', 'add_job_service_fee', 'change_job_service_fee', 'view_job_invoice',
                'documents_in_job', 'file_gd_job', 'assess_job', 'pay_duty_job', 'examine_job', 'release_job',
                'gate_out_job', 'close_job', 'cancel_job',
            ],
            DOCUMENTATION: ['view_job', 'add_job', 'change_job', 'documents_in_job', 'file_gd_job', 'assess_job'],
            FIELD_AGENT: ['view_job', 'examine_job', 'release_job'],
            ACCOUNTS: ['view_job', 'view_job_service_fee', 'view_job_invoice', 'close_job'],
        }

    def clean(self):
        if self.client_id and not self.client.is_customer:
            raise ValidationError({'client': 'Choose a client: this contact isn’t marked as a customer.'})

    def on_save(self, ctx, created):
        if created and not self.stage_since:
            self.stage_since = _today()
            self.save(update_fields=['stage_since'])

    @property
    def label(self):
        return f'{self.number} · {self.client.name}' if self.number else self.client.name

    def __str__(self):
        return self.label

    # ---- transitions

    def entered(self, ctx):
        """Every move starts the stage clock again. (A bookkeeping date, not an edit: it has no entry of its own in the trail.)"""
        self.stage_since = _today()
        type(self).objects.filter(pk=self.pk).update(stage_since=self.stage_since)

    def _billing_summary(self):
        from .services import invoice_plan

        return invoice_plan(self)

    def confirm_gate_out(self, user):
        plan = self._billing_summary()
        count = len(plan['lines'])
        sentence = (
            f'This creates a draft invoice for {format_money(plan["total"])} including '
            f'{count} disbursement{"" if count == 1 else "s"}.'
        )
        if plan['pending']:
            left = len(plan['pending'])
            sentence += (
                f' {left} disbursement{"" if left == 1 else "s"} not yet approved will be left out '
                f'({format_money(plan["pending_total"])}).'
            )
        return sentence

    def drafts_the_invoice(self, ctx):
        draft_invoice(ctx, self)
        self.refresh_from_db()
        self.entered(ctx)

    def check_close(self, user):
        invoice = Bill.objects.filter(pk=self.invoice_id).first() if self.invoice_id else None
        if invoice is None:
            return 'This job has no invoice yet.'
        if invoice.state != 'posted':
            return f'Post the invoice {invoice.number} first: a job closes once its invoice is posted.'
        return None

    def check_cancel(self, user):
        invoice = Bill.objects.filter(pk=self.invoice_id).first() if self.invoice_id else None
        if invoice is not None and invoice.state == 'posted':
            return f'The invoice {invoice.number} is posted, so this job can’t be cancelled. Reduce the invoice instead.'
        return None

    def withdraw_the_draft(self, ctx):
        """Cancelling after gate-out also withdraws the draft invoice and frees its disbursements."""
        if self.invoice_id:
            invoice = Bill.objects.select_for_update().get(pk=self.invoice_id)
            if invoice.state == 'draft':
                actions.perform_transition(ctx, invoice, 'cancel', summary=f'Withdrawn because {self.number} was cancelled')
            release_disbursements(ctx, self)


class Container(ClickerModel):
    SIZE_CHOICES = [('20', '20 ft'), ('40', '40 ft'), ('40hc', '40 ft HC')]
    STATE_CHOICES = [
        ('at_terminal', 'At terminal'),
        ('exam_hold', 'Examination hold'),
        ('out_for_delivery', 'Out for delivery'),
        ('delivered', 'Delivered'),
        ('returned_empty', 'Returned empty'),
    ]

    job = models.ForeignKey(Job, on_delete=models.PROTECT, related_name='containers')
    number = models.CharField(
        max_length=11,
        validators=[RegexValidator(CONTAINER_NUMBER, 'A container number is four capital letters and seven digits, like MSKU1234567.')],
    )
    size = models.CharField(max_length=4, choices=SIZE_CHOICES, default='40')
    discharged_on = models.DateField(null=True, blank=True, verbose_name='discharged on')
    free_days = models.PositiveSmallIntegerField(default=7, verbose_name='free days')
    demurrage_rate_per_day = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)], verbose_name='demurrage rate per day',
    )
    gate_out_on = models.DateField(null=True, blank=True, verbose_name='gate-out on')
    state = models.CharField(max_length=20, choices=STATE_CHOICES, default='at_terminal')

    class Meta:
        ordering = ['job_id', 'number']
        constraints = [
            models.UniqueConstraint(
                fields=['job', 'number'], name='container_once_per_job',
                violation_error_message='This container is already on the job.',
            )
        ]

    class Schema:
        icon = 'container'
        display_field = 'number'
        restricted_fields = ['demurrage_rate_per_day']
        field_types = {'demurrage_rate_per_day': 'currency'}
        search_fields = ['number']
        list_display = ['number', 'job', 'size', 'state', 'deadline_status', 'days_left', 'free_until', 'demurrage_accrued']
        list_sort = [{'field': 'number', 'direction': 'asc'}]
        groups = [
            {'label': 'The container', 'fields': ['job', 'number', 'size', 'state']},
            {'label': 'Free days', 'fields': ['discharged_on', 'free_days', 'free_until', 'days_left', 'deadline_status']},
            {'label': 'Leaving the port', 'fields': ['gate_out_on', 'demurrage_rate_per_day', 'demurrage_accrued']},
        ]
        computed = {
            'free_until': {
                'label': 'Free until',
                'type': 'date',
                'description': 'Discharged on + free days',
                'expression': ex.over('discharged_on', 'free_days')(lambda context: ex.free_until_expr()),
            },
            'days_left': {
                'label': 'Days left',
                'type': 'integer',
                'description': 'Free days left today (negative once past); stops when the container goes out',
                'expression': ex.over('discharged_on', 'free_days', 'gate_out_on')(lambda context: ex.days_left_expr(context.today)),
            },
            'deadline_status': {
                'label': 'Countdown',
                'type': 'selection',
                'description': 'Days of free time left: more than 5 quiet, 3 to 5 amber, 0 to 2 red, past it accruing (solid red)',
                'expression': ex.over('discharged_on', 'free_days', 'gate_out_on')(
                    lambda context: ex.status_from(ex.days_left_expr(context.today), 'cleared')
                ),
                'choices': ex.DEADLINE_CHOICES[1:],
                'tones': ex.DEADLINE_TONES,
            },
            'demurrage_accrued': {
                'label': 'Demurrage so far',
                'type': 'currency',
                'description': 'Days past free time × the daily rate; zero until free time runs out; final once the container goes out',
                'expression': ex.over('discharged_on', 'free_days', 'gate_out_on', 'demurrage_rate_per_day')(
                    lambda context: ex.accrued_expr(context.today)
                ),
            },
        }
        summaries = [
            {'label': 'Containers inside', 'aggregate': 'count', 'filter': ['gate_out_on:empty']},
            {'label': 'Accruing', 'aggregate': 'count', 'filter': ['deadline_status:in:accruing']},
            {'label': 'Demurrage so far', 'aggregate': 'sum', 'field': 'demurrage_accrued', 'filter': ['gate_out_on:empty']},
        ]
        views = [
            {
                'key': 'at_risk',
                'label': 'Free days running out',
                'filters': ['deadline_status:in:soon,urgent,accruing', 'gate_out_on:empty'],
                'ordering': 'days_left',
            },
        ]
        record_rules = [{'role': FIELD_AGENT, 'filter': {'job__assigned_to__user_id': USER}}]
        default_grants = {
            COORDINATOR: ['view_container', 'add_container', 'change_container', 'view_container_demurrage_rate_per_day', 'add_container_demurrage_rate_per_day', 'change_container_demurrage_rate_per_day'],
            DOCUMENTATION: ['view_container', 'add_container', 'change_container'],
            FIELD_AGENT: ['view_container', 'add_container', 'change_container'],
            ACCOUNTS: ['view_container', 'view_container_demurrage_rate_per_day'],
        }

    def clean(self):
        if self.number and not CONTAINER_NUMBER.match(self.number):
            raise ValidationError({'number': 'A container number is four capital letters and seven digits, like MSKU1234567.'})
        if self.gate_out_on and self.discharged_on and self.gate_out_on < self.discharged_on:
            raise ValidationError({'gate_out_on': 'A container can’t leave the port before it was discharged.'})

    def __str__(self):
        return self.number


class Disbursement(ClickerModel):
    KIND_CHOICES = [
        ('customs_duty', 'Customs duty'),
        ('port_charges', 'Port charges'),
        ('shipping_line_do', 'Shipping line DO'),
        ('terminal_handling', 'Terminal handling'),
        ('examination_labour', 'Examination labour'),
        ('transport', 'Transport'),
        ('demurrage', 'Demurrage'),
        ('other', 'Other'),
    ]
    STATE_CHOICES = [('recorded', 'Recorded'), ('approved', 'Approved'), ('billed', 'Billed')]

    job = models.ForeignKey(Job, on_delete=models.PROTECT, related_name='disbursements')
    kind = models.CharField(max_length=24, choices=KIND_CHOICES, default='other')
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(0)])
    paid_on = models.DateField(default=timezone.localdate)
    receipt_ref = models.CharField(max_length=64, blank=True, verbose_name='receipt')
    billable = models.BooleanField(default=True, help_text='Billed back to the client at cost.')
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, editable=False, on_delete=models.PROTECT,
        related_name='+', verbose_name='recorded by',
    )
    state = models.CharField(max_length=10, choices=STATE_CHOICES, default='recorded', editable=False)

    class Meta:
        ordering = ['job_id', 'paid_on', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['job', 'kind', 'receipt_ref'],
                condition=~Q(receipt_ref=''),
                name='disbursement_receipt_once',
                violation_error_message='This receipt is already recorded for this kind of payment on the job.',
            )
        ]

    class Schema:
        icon = 'wallet'
        display_field = 'label'
        restricted_fields = ['amount']
        read_only_fields = ['recorded_by']
        field_types = {'amount': 'currency'}
        on_save = 'on_save'
        search_fields = ['receipt_ref']
        list_display = ['job', 'kind', 'amount', 'paid_on', 'receipt_ref', 'billable', 'state']
        list_sort = [{'field': 'paid_on', 'direction': 'desc'}]
        groups = [
            {'label': 'The payment', 'fields': ['job', 'kind', 'amount', 'paid_on', 'receipt_ref', 'billable', 'recorded_by']},
        ]
        summaries = [
            {'label': 'Waiting for approval', 'aggregate': 'count', 'filter': ['state:in:recorded']},
            {'label': 'Waiting, in rupees', 'aggregate': 'sum', 'field': 'amount', 'filter': ['state:in:recorded']},
            {'label': 'Approved, not yet billed', 'aggregate': 'sum', 'field': 'amount', 'filter': ['state:in:approved']},
        ]
        views = [
            {'key': 'to_approve', 'label': 'Waiting for approval', 'filters': ['state:in:recorded'], 'ordering': 'paid_on'},
        ]
        workflow = {
            'field': 'state',
            'path': ['recorded', 'approved', 'billed'],
            'tones': {'approved': 'info', 'billed': 'positive'},
            'locked': ['approved', 'billed'],
            'transitions': {
                'approve': {
                    'label': 'Approve',
                    'from': ['recorded'],
                    'to': 'approved',
                    'not_by': 'recorded_by',
                    'hint': 'Accounts checks the receipt. Whoever recorded the payment can’t approve it.',
                },
            },
        }
        record_rules = [{'role': FIELD_AGENT, 'filter': {'recorded_by_id': USER}}]
        default_grants = {
            COORDINATOR: ['view_disbursement', 'add_disbursement', 'change_disbursement', 'view_disbursement_amount', 'add_disbursement_amount', 'change_disbursement_amount'],
            DOCUMENTATION: ['view_disbursement'],
            FIELD_AGENT: ['view_disbursement', 'add_disbursement', 'change_disbursement', 'view_disbursement_amount', 'add_disbursement_amount'],
            ACCOUNTS: ['view_disbursement', 'view_disbursement_amount', 'approve_disbursement'],
        }

    @property
    def label(self):
        return f'{self.get_kind_display()}' + (f' · {self.receipt_ref}' if self.receipt_ref else '')

    def __str__(self):
        return self.label

    def on_save(self, ctx, created):
        if created and self.recorded_by_id is None:
            self.recorded_by = ctx.user
            self.save(update_fields=['recorded_by'])
