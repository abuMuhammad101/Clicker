"""
Document numbers, declared on a model's Schema and assigned by the data layer:

    class Schema:
        numbering = {'field': 'number', 'prefix': 'INV', 'digits': 5}   # INV-2026-00001

The field is `editable=False` (server-owned): no client sends it, the data
layer fills it when the record is created. Numbers restart each year (the
organisation's year, settings.TIME_ZONE).

Concurrency: `next_number` must run inside the transaction that creates the
record. It takes a row lock on the sequence, so a second create waits for the
first to commit and then reads the advanced value; two creates can never get
the same number, and a rollback releases the number unused.
"""
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.utils import timezone

from .models import Sequence


def declaration(model):
    schema = getattr(model, 'Schema', None)
    decl = getattr(schema, 'numbering', None)
    if not decl:
        return None
    field = model._meta.get_field(decl['field'])
    if field.editable:
        raise ImproperlyConfigured(
            f'{model.__name__}.{field.name} is a document number, so it must be editable=False: '
            'the data layer assigns it.'
        )
    return decl


def next_number(model):
    """The next number for `model`, formatted. Call inside the creating transaction."""
    decl = declaration(model)
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError('next_number must run inside the transaction that creates the record.')
    year = timezone.localdate().year
    key = f'{model._meta.label_lower}:{year}'
    # get_or_create survives two first-ever creates racing to make the row.
    Sequence.objects.get_or_create(key=key)
    sequence = Sequence.objects.select_for_update().get(key=key)
    sequence.last += 1
    sequence.save(update_fields=['last'])
    return f'{decl["prefix"]}-{year}-{sequence.last:0{decl.get("digits", 5)}d}'


def assigned_values(model):
    """{field: number} for a record being created, or {} if the model isn't numbered."""
    decl = declaration(model)
    return {decl['field']: next_number(model)} if decl else {}
