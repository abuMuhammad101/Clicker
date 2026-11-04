"""
The invoice that drafts itself. Called from inside the gate-out transition's
transaction, never on its own. The job row is locked, and the job's `invoice`
link is one-to-one, so a second gate-out (sequential or concurrent) can never
produce a second bill.
"""
from decimal import Decimal

from billing.models import Bill, BillLine
from foundation import actions, computed
from foundation.money import format_money, quantize


def invoice_plan(job):
    """What the invoice for `job` would hold today: the fee, the approved billable disbursements, and what is left out."""
    approved = list(job.disbursements.filter(billable=True, state='approved').order_by('paid_on', 'id'))
    pending = list(job.disbursements.filter(billable=True, state='recorded').order_by('paid_on', 'id'))
    fee = job.service_fee or Decimal('0.00')
    return {
        'fee': fee,
        'lines': approved,
        'pending': pending,
        'total': quantize(fee + sum((d.amount for d in approved), Decimal('0.00'))),
        'pending_total': quantize(sum((d.amount for d in pending), Decimal('0.00'))),
    }


def _describe(disbursement):
    text = disbursement.get_kind_display()
    return f'{text} · receipt {disbursement.receipt_ref}' if disbursement.receipt_ref else text


def draft_invoice(ctx, job):
    """One draft bill for the job's client, once. Returns it."""
    from .models import Job

    locked = Job.objects.select_for_update().get(pk=job.pk)
    if locked.invoice_id:
        return Bill.objects.get(pk=locked.invoice_id)
    plan = invoice_plan(locked)
    why = f'Created by automation when {locked.number} went to Gate-out'
    notes = f'Drafted from {locked.number}' + (f' · BL {locked.bl_number}' if locked.bl_number else '') + '.'
    if plan['pending']:
        waiting = '; '.join(f'{_describe(d)} {format_money(d.amount)}' for d in plan['pending'])
        notes += f'\nNot yet billed (awaiting approval): {waiting}.'
    bill = actions.create(ctx, Bill, customer=locked.client, issue_date=computed.today(), notes=notes, summary=why)
    if plan['fee'] > 0:
        actions.create(
            ctx, BillLine, bill=bill, description=f'Clearing services · {locked.number}', quantity=1,
            unit_price=plan['fee'], pass_through=False, summary=why,
        )
    for disbursement in plan['lines']:
        actions.create(
            ctx, BillLine, bill=bill, description=_describe(disbursement), quantity=1,
            unit_price=disbursement.amount, pass_through=True, summary=why,
        )
        actions.change(ctx, disbursement, state='billed', summary=f'Billed on the draft invoice from {locked.number}')
    actions.change(ctx, locked, invoice=bill, summary=why)
    return bill


def release_disbursements(ctx, job):
    """A withdrawn draft frees the disbursements it had taken: approved again, billable on the next invoice."""
    for disbursement in job.disbursements.filter(state='billed'):
        actions.change(ctx, disbursement, state='approved', summary=f'Freed because the draft invoice for {job.number} was withdrawn')
