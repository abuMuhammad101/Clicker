"""
Money in sentences the server writes (a refusal, an audit summary), in the
organisation's currency: "Rs 12,45,000.00" (grouped as the organisation counts:
lakh style for PKR, see `CLICKER_CURRENCY['grouping']`). The browser formats the same
amounts for itself from the audit summary's `{money:…}` token, so a summary
never fixes a currency style into stored history.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings

CENT = Decimal('0.01')


def quantize(amount):
    """Round to the currency's smallest unit, half up (a bill line's amount)."""
    return Decimal(amount).quantize(CENT, rounding=ROUND_HALF_UP)


def group_digits(whole):
    """`1245000` → `12,45,000` (lakh) or `1,245,000` (western), as the organisation counts."""
    if settings.CLICKER_CURRENCY.get('grouping', 'lakh') == 'western' or len(whole) <= 3:
        return f'{int(whole):,}'
    head, tail = whole[:-3], whole[-3:]
    pairs = []
    while len(head) > 2:
        pairs.insert(0, head[-2:])
        head = head[:-2]
    return ','.join(([head] if head else []) + pairs + [tail])


def format_money(amount):
    """`Rs 12,45,000.00`; a negative amount is `−Rs 12,45,000.00`."""
    amount = quantize(amount)
    sign = '−' if amount < 0 else ''
    whole, fraction = f'{abs(amount):.2f}'.split('.')
    return f'{sign}{settings.CLICKER_CURRENCY["symbol"]} {group_digits(whole)}.{fraction}'


def money_token(amount):
    """The `{money:1245000.00}` marker an audit summary carries for its amounts."""
    return '{money:%s}' % quantize(amount)
