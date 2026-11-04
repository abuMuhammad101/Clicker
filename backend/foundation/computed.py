"""
Computed fields: values the database calculates, declared on a model's Schema.

    class Schema:
        computed = {
            'margin': {'label': 'Margin', 'type': 'currency',
                       'expression': F('sales_price') - F('cost')},
            'days_as_customer': {'label': 'Days as customer', 'type': 'integer',
                                 'expression': days_since('customer_since')},
        }

`expression` is a Django query expression, or a callable that takes a
`ComputedContext` (today's date, in the organisation's time zone) and returns
one, for values that depend on today ("days overdue", aging buckets).

The scoping function annotates every computed field onto the queryset
(`annotate`), so a computed value is sortable, filterable and summable in the
database over any number of rows. It is never a Python @property, which
couldn't be.

Computed fields are always read-only, never in a write allowlist, never
audited (nothing is stored), and readable only by someone who can read every
field they're calculated from: a value derived from a hidden field is hidden
too.

A value calculated from another model's rows (a customer's outstanding balance
is the sum of their bills) says so with `requires`, the models it reads:

    'outstanding': {'label': 'Outstanding', 'type': 'currency',
                    'expression': customer_outstanding('pk'),
                    'requires': ['billing.bill']}

and is readable only by someone who may view all of them. A computed value of
type `selection` (a payment status) carries `choices`, and optionally `tones`
(positive / warning / danger / info / neutral per value) for its chip.
"""
import datetime
from dataclasses import dataclass

from django.conf import settings
from django.db import models as djm
from django.db.models import Value
from django.db.models.expressions import CombinedExpression, F
from django.db.models.functions import ExtractDay
from django.utils import timezone

TYPES = ('currency', 'decimal', 'integer', 'date', 'datetime', 'selection')

CONNECTORS = {'+': '+', '-': '−', '*': '×', '/': '÷'}


@dataclass(frozen=True)
class ComputedContext:
    today: datetime.date


def today():
    """Today, in the organisation's time zone (settings.TIME_ZONE). One place to mock in tests."""
    return timezone.localdate()


def current_context():
    return ComputedContext(today=today())


def declarations(model):
    """{name: spec} from the model's Schema.computed, in declaration order."""
    schema = getattr(model, 'Schema', None)
    return dict(getattr(schema, 'computed', {}) or {})


def expression_for(spec, context):
    expression = spec['expression']
    if callable(expression) and not hasattr(expression, 'resolve_expression'):
        expression = expression(context)
    return expression


def output_field(spec):
    kind = spec['type']
    if kind in ('currency', 'decimal'):
        places = settings.CLICKER_CURRENCY['decimal_places'] if kind == 'currency' else spec.get('decimal_places', 2)
        return djm.DecimalField(max_digits=20, decimal_places=places)
    if kind == 'integer':
        return djm.IntegerField()
    if kind == 'date':
        return djm.DateField()
    if kind == 'datetime':
        return djm.DateTimeField()
    if kind == 'selection':
        return djm.CharField(max_length=32)
    raise ValueError(f'Unknown computed type {kind!r}')


def _walk(expression):
    yield expression
    if isinstance(expression, F):
        return
    for source in getattr(expression, 'get_source_expressions', lambda: [])():
        if source is not None:
            yield from _walk(source)


def dependencies(spec):
    """The model field names an expression reads (its F() references)."""
    declared = getattr(spec['expression'], 'depends_on', None)
    if declared is not None:
        return list(declared)
    expression = expression_for(spec, ComputedContext(today=datetime.date(2000, 1, 1)))
    names = []
    for node in _walk(expression):
        if isinstance(node, F) and node.name not in names:
            names.append(node.name.split('__')[0])
    return names


def describe(model, spec):
    """
    What it's calculated from, in words a person reads in a tooltip:
    "Sales price − Cost". A declaration may say it better with `description`.
    """
    if spec.get('description'):
        return spec['description']
    expression = spec['expression']
    labels = {name: _label(model, name) for name in dependencies(spec)}
    if hasattr(expression, 'describe'):
        return expression.describe(labels)
    return _describe(expression, labels)


def _label(model, name):
    verbose = str(model._meta.get_field(name).verbose_name)
    return verbose[:1].upper() + verbose[1:]


def _describe(expression, labels):
    if isinstance(expression, F):
        return labels.get(expression.name, expression.name)
    if isinstance(expression, CombinedExpression):
        left, right = expression.get_source_expressions()
        return f'{_describe(left, labels)} {CONNECTORS.get(expression.connector, expression.connector)} {_describe(right, labels)}'
    if isinstance(expression, Value):
        return str(expression.value)
    return type(expression).__name__


def annotate(queryset, model, context=None):
    """Every computed field of `model`, annotated onto `queryset`."""
    specs = declarations(model)
    if not specs:
        return queryset
    context = context or current_context()
    return queryset.annotate(**{
        name: djm.ExpressionWrapper(expression_for(spec, context), output_field=output_field(spec))
        for name, spec in specs.items()
    })


def over(*field_names):
    """
    Marks an expression builder (a callable taking the context) with the
    model fields it reads, for the "hidden if derived from a hidden field"
    rule. A builder that reads other models' rows reads no field of its own:
    `@over()`, and the spec's `requires` says which models it needs.
    """

    def mark(builder):
        builder.depends_on = list(field_names)
        return builder

    return mark


def days_since(field_name):
    """
    Whole days from `field_name` (a date) to today; negative if it's in the
    future. For "days overdue" and aging buckets: `days_since('due_date')`.
    """

    def build(context):
        elapsed = Value(context.today, output_field=djm.DateField()) - F(field_name)
        return ExtractDay(djm.ExpressionWrapper(elapsed, output_field=djm.DurationField()))

    build.depends_on = [field_name]
    build.describe = lambda labels: f'Days from {labels[field_name]} to today'
    return build
