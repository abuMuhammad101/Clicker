"""
Applying money to bills. Called from inside a transition's transaction (a
payment posting or being cancelled, a bill being posted), never on its own.

The one rule that matters, and where it is kept: rows are locked in the same
order everywhere, oldest bill first (due date, then number). Two cashiers
posting for the same customer at the same instant therefore queue on the
oldest open bill; the second then reads what the first left, so no bill is
ever allocated more than its balance.
"""
from decimal import Decimal

from django.db.models import F

from foundation import actions
from foundation.money import money_token


def _models():
    from .models import Bill, Payment, PaymentAllocation

    return Bill, Payment, PaymentAllocation


def open_bills_locked(customer_id):
    """The customer's posted bills with a balance, oldest first, locked for the transaction."""
    Bill, _, _ = _models()
    return (
        Bill.objects.select_for_update()
        .filter(customer_id=customer_id, state='posted', amount_total__gt=F('amount_paid') + F('amount_adjusted'))
        .order_by('due_date', 'number', 'pk')
    )


def unallocated(payment):
    """What is left of a payment after the allocations that still stand."""
    _, _, PaymentAllocation = _models()
    used = sum(
        PaymentAllocation.objects.filter(payment=payment, reversed=False).values_list('amount', flat=True),
        Decimal('0.00'),
    )
    return payment.amount - used


def allocate_payment(ctx, payment):
    """
    Apply what is left of `payment` to its customer's open bills, oldest
    first. Whatever no bill can take stays unallocated: the customer's
    advance. Returns the amount allocated.
    """
    _, _, PaymentAllocation = _models()
    remaining = unallocated(payment)
    allocated = Decimal('0.00')
    if remaining <= 0:
        return allocated
    for bill in open_bills_locked(payment.customer_id):
        if remaining <= 0:
            break
        take = min(bill.balance_value, remaining)
        actions.create(ctx, PaymentAllocation, payment=payment, bill=bill, amount=take)
        actions.change(
            ctx,
            bill,
            summary=f'Payment {payment.number} allocated {money_token(take)}',
            amount_paid=bill.amount_paid + take,
        )
        remaining -= take
        allocated += take
    return allocated


def apply_advances(ctx, bill):
    """A customer's advance goes to their next bill: when one is posted, apply what they hold."""
    _, Payment, _ = _models()
    for payment in Payment.objects.select_for_update().filter(
        customer_id=bill.customer_id, state='posted'
    ).order_by('payment_date', 'number'):
        allocate_payment(ctx, payment)


def reverse_payment(ctx, payment):
    """Cancelling a payment: every allocation that stands is undone, and the bills owe it again."""
    Bill, _, PaymentAllocation = _models()
    standing = (
        PaymentAllocation.objects.select_for_update(of=('self',))
        .filter(payment=payment, reversed=False)
        .select_related('bill')
        .order_by('bill__due_date', 'bill__number', 'pk')
    )
    for allocation in standing:
        bill = Bill.objects.select_for_update().get(pk=allocation.bill_id)
        actions.change(
            ctx,
            bill,
            summary=f'Payment {payment.number} was cancelled; {money_token(allocation.amount)} is owed again',
            amount_paid=bill.amount_paid - allocation.amount,
        )
        actions.change(ctx, allocation, reversed=True)


def customer_outstanding_value(customer_id):
    """What a customer owes now, as a number (a recovery case's opening snapshot)."""
    Bill, _, _ = _models()
    return sum(
        (b.balance_value for b in Bill.objects.filter(customer_id=customer_id, state='posted')),
        Decimal('0.00'),
    )
