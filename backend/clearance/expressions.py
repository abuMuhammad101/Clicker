"""
Database expressions for a container's free days, so a countdown sorts, filters
and sums like a column and a job can ask for its earliest deadline in one query.

Today is the organisation's today (`foundation.computed`), never the server's.
A container that has gone through the gate (`gate_out_on` set) stops counting:
nothing is left to count down, and its demurrage is final.
"""
import datetime
from decimal import Decimal

from django.db.models import (
    Case,
    CharField,
    Count,
    DateField,
    DurationField,
    Exists,
    ExpressionWrapper,
    F,
    IntegerField,
    Min,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Cast, Coalesce, ExtractDay, Greatest, Round
from django.db.models.lookups import IsNull, LessThan, LessThanOrEqual

from billing.expressions import MONEY, ZERO
from foundation.computed import over

ONE_DAY = Value(datetime.timedelta(days=1), output_field=DurationField())

# What the countdown chip says, in the order it gets worse. Thresholds are days left.
DEADLINE_CHOICES = [
    ('none', 'No containers'),
    ('cleared', 'Cleared'),
    ('comfortable', 'More than 5 days'),
    ('soon', '3 to 5 days left'),
    ('urgent', '0 to 2 days left'),
    ('accruing', 'Accruing demurrage'),
]
DEADLINE_TONES = {
    'none': 'neutral',
    'cleared': 'positive',
    'comfortable': 'neutral',
    'soon': 'warning',
    'urgent': 'danger',
    'accruing': 'critical',
}


def free_until_expr(prefix=''):
    """The last free day: discharged on + free days."""
    shifted = ExpressionWrapper(
        F(f'{prefix}discharged_on') + F(f'{prefix}free_days') * ONE_DAY, output_field=DurationField()
    )
    return Cast(shifted, DateField())


def days_left_expr(today, prefix=''):
    """Free days left today (negative once past): empty when not discharged yet or through the gate."""
    elapsed = ExtractDay(
        ExpressionWrapper(Value(today, output_field=DateField()) - F(f'{prefix}discharged_on'), output_field=DurationField())
    )
    return Case(
        When(Q(**{f'{prefix}discharged_on__isnull': True}) | Q(**{f'{prefix}gate_out_on__isnull': False}), then=Value(None)),
        default=F(f'{prefix}free_days') - elapsed,
        output_field=IntegerField(),
    )


def status_from(days, when_empty):
    """The chip for a days-left expression: worse as the days run out, `when_empty` when there is no countdown."""
    return Case(
        When(IsNull(days, True), then=Value(when_empty)),
        When(LessThan(days, 0), then=Value('accruing')),
        When(LessThanOrEqual(days, 2), then=Value('urgent')),
        When(LessThanOrEqual(days, 5), then=Value('soon')),
        default=Value('comfortable'),
        output_field=CharField(),
    )


def days_over_expr(today, prefix=''):
    """Days past the free period: up to today, or up to the gate-out day once through the gate. Never negative."""
    until = Coalesce(F(f'{prefix}gate_out_on'), Value(today, output_field=DateField()))
    elapsed = ExtractDay(ExpressionWrapper(until - F(f'{prefix}discharged_on'), output_field=DurationField()))
    return Case(
        When(Q(**{f'{prefix}discharged_on__isnull': True}), then=Value(0)),
        default=Greatest(elapsed - F(f'{prefix}free_days'), Value(0)),
        output_field=IntegerField(),
    )


def accrued_expr(today, prefix=''):
    """Demurrage so far: days past free time × the daily rate. Zero until free time runs out."""
    return Round(
        ExpressionWrapper(days_over_expr(today, prefix) * F(f'{prefix}demurrage_rate_per_day'), output_field=MONEY), 2
    )


def open_containers(job_ref='pk'):
    """This job's containers still on the terminal side of the gate, as a queryset keyed by job."""
    from .models import Container

    return Container.objects.filter(job=OuterRef(job_ref), gate_out_on__isnull=True, discharged_on__isnull=False).order_by()


@over()
def job_containers_count(context):
    from .models import Container

    count = Container.objects.filter(job=OuterRef('pk')).order_by().values('job').annotate(n=Count('pk')).values('n')
    return Coalesce(Subquery(count, output_field=IntegerField()), Value(0))


@over()
def job_next_deadline(context):
    """The earliest last-free-day among containers still inside."""
    earliest = (
        open_containers()
        .annotate(deadline=free_until_expr())
        .values('job')
        .annotate(first=Min('deadline'))
        .values('first')
    )
    return Subquery(earliest, output_field=DateField())


def _job_min_days(context):
    least = (
        open_containers()
        .annotate(left=days_left_expr(context.today))
        .values('job')
        .annotate(least=Min('left'))
        .values('least')
    )
    return Subquery(least, output_field=IntegerField())


@over()
def job_demurrage_status(context):
    """The worst container's chip: accruing beats 0-2 days beats 3-5. No countdown: cleared, or none."""
    from .models import Container

    anything = Container.objects.filter(job=OuterRef('pk')).values('pk')
    days = _job_min_days(context)
    return Case(
        When(~Exists(anything), then=Value('none')),
        default=status_from(days, 'cleared'),
        output_field=CharField(),
    )


@over('state', 'stage_since')
def job_days_in_stage(context):
    """How long it has been where it is (open jobs only)."""
    elapsed = ExtractDay(
        ExpressionWrapper(Value(context.today, output_field=DateField()) - F('stage_since'), output_field=DurationField())
    )
    return Case(
        When(state__in=['closed', 'cancelled'], then=Value(None)),
        default=elapsed,
        output_field=IntegerField(),
    )


def _disbursement_sum(*states):
    from .models import Disbursement

    total = (
        Disbursement.objects.filter(job=OuterRef('pk'), billable=True, state__in=states)
        .order_by()
        .values('job')
        .annotate(total=Sum('amount'))
        .values('total')
    )
    return Coalesce(Subquery(total, output_field=MONEY), ZERO)


@over()
def job_disbursements_total(context):
    """Everything the agency has paid out on the job, billable or not."""
    from .models import Disbursement

    total = Disbursement.objects.filter(job=OuterRef('pk')).order_by().values('job').annotate(total=Sum('amount')).values('total')
    return Coalesce(Subquery(total, output_field=MONEY), ZERO)


@over('service_fee')
def job_billable_total(context):
    """What the invoice will total: the service fee plus billable disbursements already approved (or billed)."""
    return ExpressionWrapper(Coalesce(F('service_fee'), ZERO) + _disbursement_sum('approved', 'billed'), output_field=MONEY)
