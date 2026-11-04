"""
Database expressions over a consumer's recovery cases, for the models that
show them (a contact's open-case count). Built lazily, so a shared model can
list the figure without importing the water models at load time.
"""
from django.db.models import Count, IntegerField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce

from foundation.computed import over


def consumer_open_cases(outer='pk'):
    """How many recovery cases this consumer has open (any stage before settled or written off)."""

    @over()
    def build(context):
        from .models import OPEN_CASE_STATES, RecoveryCase

        count = (
            RecoveryCase.objects.filter(consumer=OuterRef(outer), state__in=OPEN_CASE_STATES)
            .order_by()
            .values('consumer')
            .annotate(total=Count('pk'))
            .values('total')
        )
        return Coalesce(Subquery(count, output_field=IntegerField()), Value(0))

    return build
