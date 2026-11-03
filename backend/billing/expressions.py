"""
Database expressions for what a customer owes, shared by every model that
shows it (a contact's outstanding balance, a recovery case's, a reduction's
context). Each is built from the customer's posted bills, in the database,
so it sorts, filters and sums like a column.

`outer` names the field on the row being annotated that holds the customer's
id: 'pk' on a contact, 'consumer_id' on a recovery case.
"""
from decimal import Decimal

from django.db.models import (
    DecimalField,
    DurationField,
    ExpressionWrapper,
    F,
    IntegerField,
    Max,
    OuterRef,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce, ExtractDay, Greatest

from foundation.computed import over

MONEY = DecimalField(max_digits=20, decimal_places=2)
ZERO = Value(Decimal('0.00'), output_field=MONEY)
BALANCE = F('amount_total') - F('amount_paid') - F('amount_adjusted')


def _bills(outer):
    from billing.models import Bill

    return Bill.objects.filter(customer=OuterRef(outer), state='posted').order_by()


def customer_outstanding(outer='pk'):
    """What the customer owes on their posted bills."""

    @over()
    def build(context):
        owed = _bills(outer).values('customer').annotate(total=Sum(BALANCE)).values('total')
        return Coalesce(Subquery(owed, output_field=MONEY), ZERO)

    return build


def customer_oldest_overdue_days(outer='pk'):
    """Days since the oldest unpaid bill fell due; empty when nothing is overdue."""

    @over()
    def build(context):
        late = (
            _bills(outer)
            .filter(due_date__lt=context.today, amount_total__gt=F('amount_paid') + F('amount_adjusted'))
            .values('customer')
            .annotate(days=Max(ExtractDay(ExpressionWrapper(Value(context.today) - F('due_date'), output_field=DurationField()))))
            .values('days')
        )
        return Subquery(late, output_field=IntegerField())

    return build


def customer_advance(outer='pk'):
    """Money the customer has paid that isn't allocated to any bill: their advance."""

    @over()
    def build(context):
        from billing.models import Payment, PaymentAllocation

        paid = (
            Payment.objects.filter(customer=OuterRef(outer), state='posted')
            .order_by()
            .values('customer')
            .annotate(total=Sum('amount'))
            .values('total')
        )
        used = (
            PaymentAllocation.objects.filter(payment__customer=OuterRef(outer), payment__state='posted', reversed=False)
            .order_by()
            .values('payment__customer')
            .annotate(total=Sum('amount'))
            .values('total')
        )
        return Greatest(Coalesce(Subquery(paid, output_field=MONEY), ZERO) - Coalesce(Subquery(used, output_field=MONEY), ZERO), ZERO)

    return build

