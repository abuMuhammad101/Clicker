"""
Money in sentences the server writes (a refusal, an audit summary), in the
organisation's currency: "Rs 1,245,000.00". The browser formats the same
amounts for itself from the audit summary's `{money:…}` token, so a summary
never fixes a currency style into stored history.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings

CENT = Decimal('0.01')


def quantize(amount):
    """Round to the currency's smallest unit, half up (a bill line's amount)."""
    return Decimal(amount).quantize(CENT, rounding=ROUND_HALF_UP)


def format_money(amount):
    """`Rs 1,245,000.00`; a negative amount is `−Rs 1,245,000.00`."""
    amount = quantize(amount)
    sign = '−' if amount < 0 else ''
    return f'{sign}{settings.CLICKER_CURRENCY["symbol"]} {abs(amount):,.2f}'


def money_token(amount):
    """The `{money:1245000.00}` marker an audit summary carries for its amounts."""
    return '{money:%s}' % quantize(amount)
