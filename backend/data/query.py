"""
The list query grammar: filters, groups and summaries, for every model, from
its schema. No per-model code.

Filters
-------

    ?filter=<field>:<operator>[:<value>]      repeatable; every one must hold

    ?filter=state:in:posted,cancelled
    ?filter=amount:gte:100000
    ?filter=due_date:before:2026-10-01
    ?filter=due_date:preset:this_month
    ?filter=customer:contains:indus traders     (everything after the 2nd colon)
    ?filter=parent:empty

Operators, by the field's type (a computed field uses its result type's):

    text, longtext, email, phone, url   contains:<text>  is:<text>  empty
    selection (workflow state too)      in:<value>,<value>
    boolean                             is:true  is:false
    date                                on:<date>  before:<date>  after:<date>
                                        between:<date>,<date>  older_than:<days>
                                        preset:today|yesterday|this_month|last_month|this_year
                                        empty
    integer, decimal, currency          eq:<n>  gte:<n>  lte:<n>  between:<n>,<n>  empty
    many_to_one                         in:<id>,<id>  empty

Dates are ISO (2026-10-30); `before` and `after` are strict; `between` is
inclusive at both ends; `older_than:30` means "more than 30 days ago".
"Today" is the organisation's (settings.TIME_ZONE), as for computed fields.

Every filter is checked before anything runs: an unknown or unreadable field,
an operator the type doesn't allow, or a value that isn't one is a 400 with a
sentence, never a 500 and never silently ignored. A field the user can't read
gets the same answer as one that doesn't exist.

Groups
------

    ?group_by=<field>    selection, workflow state, boolean, many_to_one,
                         date (by month), or a computed field with `buckets`

Each group comes back with its count, the sum of every currency field the
user can read, and the filter that selects its rows, so the rows of a group
are fetched through the ordinary list endpoint with one more filter.

Summaries
---------

`Schema.summaries`: at most four aggregates over the current filtered set,

    summaries = [
        {'label': 'Outstanding', 'aggregate': 'sum', 'field': 'amount',
         'filter': ['state:in:posted']},
        {'label': 'Bills', 'aggregate': 'count'},
    ]

computed in one query. A summary over a field the user can't read, or whose
filter needs one, isn't returned at all.
"""
import datetime
import decimal
from dataclasses import dataclass

from django.db import models as djm
from django.db.models import Avg, Case, Count, F, IntegerField, Q, Sum, Value, When
from django.db.models.functions import TruncMonth
from rest_framework.exceptions import ValidationError

from foundation import computed

TEXT_TYPES = ('text', 'longtext', 'email', 'phone', 'url')
NUMBER_TYPES = ('integer', 'decimal', 'currency')

OPERATORS = {
    **{kind: ('contains', 'is', 'empty') for kind in TEXT_TYPES},
    'selection': ('in',),
    'boolean': ('is',),
    'date': ('on', 'before', 'after', 'between', 'older_than', 'preset', 'empty'),
    **{kind: ('eq', 'gte', 'lte', 'between', 'empty') for kind in NUMBER_TYPES},
    'many_to_one': ('in', 'empty'),
}

DATE_PRESETS = ('today', 'yesterday', 'this_month', 'last_month', 'this_year')

GROUPABLE = ('selection', 'boolean', 'many_to_one', 'date')

AGGREGATES = ('sum', 'count', 'avg')
MAX_SUMMARIES = 4

# The same answer for a field that doesn't exist and one the user can't read:
# telling them apart would confirm a hidden field exists.
NOT_FILTERABLE = 'You can’t filter by this field.'
NOT_GROUPABLE = 'You can’t group by this field.'


@dataclass(frozen=True)
class Filter:
    field: str
    op: str
    values: tuple = ()

    def as_text(self):
        """Back to the query-string form, for a group or summary to hand out."""
        if not self.values:
            return f'{self.field}:{self.op}'
        return f'{self.field}:{self.op}:{",".join(_text(v) for v in self.values)}'


def _text(value):
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, datetime.date):
        return value.isoformat()
    return str(value)


def _label(entry, name):
    return entry.get('label') or name


def _refuse(message):
    raise ValidationError({'filter': [message]})


def parse_filter(raw, fields):
    """
    One `field:op:value` string → a checked, typed `Filter`. `fields` is the
    user's schema `fields` (readable only), so an unreadable field is refused
    exactly like an unknown one.
    """
    parts = str(raw).split(':', 2)
    if len(parts) < 2 or not parts[0] or not parts[1]:
        _refuse('A filter reads field:operator:value, like “amount:gte:1000”.')
    name, op = parts[0], parts[1]
    value = parts[2] if len(parts) == 3 else None
    entry = fields.get(name)
    if entry is None:
        _refuse(NOT_FILTERABLE)
    kind = entry['type']
    allowed = OPERATORS.get(kind)
    label = _label(entry, name)
    if not allowed:
        _refuse(f'“{label}” can’t be filtered.')
    if op not in allowed:
        _refuse(f'“{label}” can’t be filtered with “{op}”. Use one of: {", ".join(allowed)}.')

    if op == 'empty':
        if value not in (None, ''):
            _refuse(f'“{label}: empty” takes no value.')
        return Filter(name, op)
    if value is None or value == '':
        _refuse(f'“{label}: {op}” needs a value.')

    if op == 'contains' or (op == 'is' and kind in TEXT_TYPES):
        return Filter(name, op, (value,))
    if kind == 'boolean':
        lowered = value.strip().lower()
        if lowered not in ('true', 'false'):
            _refuse(f'“{label}” is true or false, not “{value}”.')
        return Filter(name, op, (lowered == 'true',))
    if kind == 'selection':
        choices = {str(choice['value']) for choice in entry.get('choices', [])}
        values = tuple(v.strip() for v in value.split(',') if v.strip())
        unknown = [v for v in values if v not in choices]
        if not values or unknown:
            _refuse(f'“{label}” has no option “{(unknown or [value])[0]}”.')
        return Filter(name, op, values)
    if kind == 'many_to_one':
        try:
            ids = tuple(int(v) for v in value.split(',') if v.strip())
        except ValueError:
            _refuse(f'“{label}” is filtered by record ids, like “in:4,9”.')
        if not ids:
            _refuse(f'“{label}: in” needs at least one record.')
        return Filter(name, op, ids)
    if kind == 'date':
        if op == 'preset':
            if value not in DATE_PRESETS:
                _refuse(f'“{value}” isn’t a date preset. Use one of: {", ".join(DATE_PRESETS)}.')
            return Filter(name, op, (value,))
        if op == 'older_than':
            days = _integer(value, label)
            if days < 0:
                _refuse(f'“{label}: older_than” needs a number of days, 0 or more.')
            return Filter(name, op, (days,))
        values = tuple(_date(v, label) for v in value.split(','))
        return Filter(name, op, _arity(op, values, label))
    # Numbers: integers for integer fields, exact decimals for money.
    convert = _integer if kind == 'integer' else _decimal
    values = tuple(convert(v, label) for v in value.split(','))
    return Filter(name, op, _arity(op, values, label))


def _arity(op, values, label):
    if op == 'between':
        if len(values) != 2:
            _refuse(f'“{label}: between” needs two values, like “between:10,20”.')
        if values[0] > values[1]:
            _refuse(f'“{label}: between” needs the lower value first.')
        return values
    if len(values) != 1:
        _refuse(f'“{label}: {op}” takes one value.')
    return values


def _integer(value, label):
    try:
        return int(value.strip())
    except ValueError:
        _refuse(f'“{label}” needs a whole number, not “{value}”.')


def _decimal(value, label):
    try:
        number = decimal.Decimal(value.strip())
    except decimal.InvalidOperation:
        _refuse(f'“{label}” needs a number, not “{value}”.')
    if not number.is_finite():
        _refuse(f'“{label}” needs a number, not “{value}”.')
    return number


def _date(value, label):
    try:
        return datetime.date.fromisoformat(value.strip())
    except ValueError:
        _refuse(f'“{label}” needs a date like 2026-10-30, not “{value}”.')


def preset_range(preset, today):
    """A date preset as an inclusive (start, end)."""
    if preset == 'today':
        return today, today
    if preset == 'yesterday':
        day = today - datetime.timedelta(days=1)
        return day, day
    if preset == 'this_month':
        return today.replace(day=1), _month_end(today)
    if preset == 'last_month':
        end = today.replace(day=1) - datetime.timedelta(days=1)
        return end.replace(day=1), end
    if preset == 'this_year':
        return today.replace(month=1, day=1), today.replace(month=12, day=31)
    raise ValueError(preset)


def _month_end(day):
    following = (day.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    return following - datetime.timedelta(days=1)


def condition(item, fields, today):
    """A parsed `Filter` as a Q object. Computed fields are annotations, so the same lookups apply."""
    name, op, values = item.field, item.op, item.values
    kind = fields[name]['type']
    if op == 'empty':
        empty = Q(**{f'{name}__isnull': True})
        if kind in TEXT_TYPES and 'computed' not in fields[name]:
            empty |= Q(**{name: ''})
        return empty
    if op == 'contains':
        return Q(**{f'{name}__icontains': values[0]})
    if op == 'is':
        return Q(**{f'{name}__iexact' if kind in TEXT_TYPES else name: values[0]})
    if op == 'in':
        return Q(**{f'{name}__in': values})
    if op in ('eq', 'on'):
        return Q(**{name: values[0]})
    if op == 'gte':
        return Q(**{f'{name}__gte': values[0]})
    if op == 'lte':
        return Q(**{f'{name}__lte': values[0]})
    if op == 'before':
        return Q(**{f'{name}__lt': values[0]})
    if op == 'after':
        return Q(**{f'{name}__gt': values[0]})
    if op == 'between':
        return Q(**{f'{name}__gte': values[0], f'{name}__lte': values[1]})
    if op == 'older_than':
        return Q(**{f'{name}__lt': today - datetime.timedelta(days=values[0])})
    if op == 'preset':
        start, end = preset_range(values[0], today)
        return Q(**{f'{name}__gte': start, f'{name}__lte': end})
    raise ValueError(op)


def parse_filters(raw_filters, fields):
    return [parse_filter(raw, fields) for raw in raw_filters]


def apply_filters(queryset, filters, fields, today=None):
    today = today or computed.today()
    for item in filters:
        queryset = queryset.filter(condition(item, fields, today))
    return queryset


# ---------------------------------------------------------------- groups


def groupable(entry):
    """Can a list be grouped by this schema field?"""
    if entry.get('computed'):
        return bool(entry.get('buckets')) or entry['type'] == 'date'
    return entry['type'] in GROUPABLE


def money_fields(fields):
    """Every currency field in the user's schema, computed ones included: what a group header sums."""
    return [name for name, entry in fields.items() if entry['type'] == 'currency']


def _sums(names):
    return {f'sum__{name}': Sum(name) for name in names}


def _sum_values(row, names):
    return {name: str(row[f'sum__{name}'] if row[f'sum__{name}'] is not None else decimal.Decimal('0.00')) for name in names}


def groups(queryset, model, fields, name, labels_for=None):
    """
    The group headers for `queryset` grouped by `name`: one aggregate query
    for all of them, never one per group.

    `labels_for(name, ids)` resolves many_to_one labels through the target's
    own scope (ids it can't see come back restricted, never named).
    """
    entry = fields.get(name)
    if entry is None or not groupable(entry):
        raise ValidationError({'group_by': [NOT_GROUPABLE]})
    kind = entry['type']
    sums = money_fields(fields)
    label = _label(entry, name)

    if entry.get('buckets'):
        whens = [
            When(_bucket_q(name, bucket), then=Value(index))
            for index, bucket in enumerate(entry['buckets'])
        ]
        key = Case(*whens, default=None, output_field=IntegerField())
    elif kind == 'date':
        key = TruncMonth(name, output_field=djm.DateField())
    else:
        key = F(name)

    rows = list(queryset.order_by().values(group_key=key).annotate(group_count=Count('pk'), **_sums(sums)))

    if kind == 'many_to_one':
        ids = [row['group_key'] for row in rows if row['group_key'] is not None]
        names = labels_for(name, ids) if labels_for else {}

    result = []
    for row in rows:
        value = row['group_key']
        group = {'count': row['group_count'], 'sums': _sum_values(row, sums)}
        if value is None:
            group.update(key='', label='Not set' if entry.get('computed') else f'No {label.lower()}',
                         filter=Filter(name, 'empty').as_text(), empty=True)
            if entry.get('buckets'):
                # Outside every bucket, or no value at all: rows the buckets
                # don't cover. Their filter can't be one condition, so the
                # header has none and the group can't be opened.
                group['filter'] = None
                group['label'] = 'Other'
        elif entry.get('buckets'):
            bucket = entry['buckets'][value]
            group.update(key=str(value), label=bucket['label'], filter=_bucket_filter(name, bucket))
        elif kind == 'date':
            group.update(
                key=value.isoformat(),
                label=value.strftime('%b %Y'),
                filter=Filter(name, 'between', (value, _month_end(value))).as_text(),
            )
        elif kind == 'boolean':
            group.update(key=_text(value), label='Yes' if value else 'No', filter=Filter(name, 'is', (value,)).as_text())
        elif kind == 'many_to_one':
            shown = names.get(value)
            group.update(key=str(value), label=shown, filter=Filter(name, 'in', (value,)).as_text())
            if shown is None:
                group['restricted'] = True
        else:
            choices = {str(choice['value']): choice['label'] for choice in entry.get('choices', [])}
            group.update(key=str(value), label=choices.get(str(value), str(value)), filter=Filter(name, 'in', (value,)).as_text())
        result.append(group)

    return sorted(result, key=_group_order(entry, kind))


def _group_order(entry, kind):
    if entry.get('buckets'):
        return lambda g: (g['key'] == '', int(g['key'] or 0))
    if kind == 'selection':
        order = [str(choice['value']) for choice in entry.get('choices', [])]
        return lambda g: (g['key'] == '', order.index(g['key']) if g['key'] in order else len(order))
    if kind == 'boolean':
        return lambda g: (g['key'] == '', g['key'] != 'true')
    if kind == 'many_to_one':
        return lambda g: (g['key'] == '', g.get('restricted', False), (g['label'] or '').lower())
    return lambda g: (g['key'] == '', g['key'])


def _bucket_q(name, bucket):
    q = Q()
    if bucket.get('min') is not None:
        q &= Q(**{f'{name}__gte': bucket['min']})
    if bucket.get('max') is not None:
        q &= Q(**{f'{name}__lte': bucket['max']})
    return q


def _bucket_filter(name, bucket):
    low, high = bucket.get('min'), bucket.get('max')
    if low is not None and high is not None:
        return Filter(name, 'between', (low, high)).as_text()
    if low is not None:
        return Filter(name, 'gte', (low,)).as_text()
    return Filter(name, 'lte', (high,)).as_text()


# ------------------------------------------------------------- summaries


def declared_summaries(model):
    schema = getattr(model, 'Schema', None)
    return list(getattr(schema, 'summaries', []) or [])


def summaries(queryset, model, fields, today=None):
    """
    The model's declared summaries over `queryset`, in one query. A summary
    over an unreadable field, or filtered by one, is left out entirely.
    """
    today = today or computed.today()
    usable = []
    for index, spec in enumerate(declared_summaries(model)):
        field = spec.get('field')
        if field is not None and field not in fields:
            continue
        try:
            filters = parse_filters(spec.get('filter', []), fields)
        except ValidationError:
            continue
        usable.append((index, spec, filters))
    if not usable:
        return []

    aggregates = {}
    for index, spec, filters in usable:
        where = Q()
        for item in filters:
            where &= condition(item, fields, today)
        kind = spec['aggregate']
        if kind == 'count':
            aggregates[f's{index}'] = Count('pk', filter=where)
        elif kind == 'sum':
            aggregates[f's{index}'] = Sum(spec['field'], filter=where)
        else:
            aggregates[f's{index}'] = Avg(spec['field'], filter=where)
    values = queryset.order_by().aggregate(**aggregates)

    result = []
    for index, spec, filters in usable:
        value = values[f's{index}']
        kind = spec['aggregate']
        field_type = 'integer' if kind == 'count' else fields[spec['field']]['type']
        if kind != 'count':
            places = fields[spec['field']].get('decimal_places', 2)
            value = decimal.Decimal(value or 0).quantize(decimal.Decimal(1).scaleb(-places))
        result.append({
            'key': str(index),
            'label': spec['label'],
            'aggregate': kind,
            'type': field_type,
            'value': str(value if value is not None else 0),
            'filter': [item.as_text() for item in filters],
        })
    return result


def check_summaries(model, fields):
    """Startup check for Schema.summaries: problems as sentences (empty when fine)."""
    problems = []
    specs = declared_summaries(model)
    if len(specs) > MAX_SUMMARIES:
        problems.append(f'declares {len(specs)} summaries; at most {MAX_SUMMARIES} fit the strip.')
    for spec in specs:
        if spec.get('aggregate') not in AGGREGATES:
            problems.append(f'summary “{spec.get("label")}” has aggregate {spec.get("aggregate")!r}; use one of {AGGREGATES}.')
            continue
        if spec['aggregate'] != 'count' and spec.get('field') not in fields:
            problems.append(f'summary “{spec.get("label")}” sums unknown field {spec.get("field")!r}.')
        problems.extend(_filter_problems(spec.get('filter', []), fields, f'summary “{spec.get("label")}”'))
    return problems


def _filter_problems(raw_filters, fields, where):
    problems = []
    for raw in raw_filters:
        try:
            parse_filter(raw, fields)
        except ValidationError as error:
            problems.append(f'{where} filter {raw!r}: {error.detail["filter"][0]}')
    return problems


# ----------------------------------------------------------------- views


def declared_views(model):
    schema = getattr(model, 'Schema', None)
    return list(getattr(schema, 'views', []) or [])


VIEW_KEYS = ('filters', 'ordering', 'group_by', 'collapsed', 'columns', 'density')
DENSITIES = ('compact', 'default', 'comfortable')


def narrow_view(state, fields):
    """
    A saved view's state as `fields` (one user's schema) allows it, and how
    many of its parts were dropped. A view never widens access: a filter,
    sort, grouping or column on a field this user can't read is removed, not
    applied, and the list says so quietly.
    """
    state = dict(state or {})
    dropped = 0
    filters = []
    for raw in state.get('filters') or []:
        try:
            parse_filter(raw, fields)
        except ValidationError:
            dropped += 1
            continue
        filters.append(raw)
    narrowed = {'filters': filters}

    ordering = []
    for part in (state.get('ordering') or '').split(','):
        part = part.strip()
        if not part:
            continue
        if part.lstrip('-') in fields:
            ordering.append(part)
        else:
            dropped += 1
    narrowed['ordering'] = ','.join(ordering)

    group_by = state.get('group_by') or None
    if group_by and (group_by not in fields or not groupable(fields[group_by])):
        dropped += 1
        group_by = None
    narrowed['group_by'] = group_by
    narrowed['collapsed'] = [str(key) for key in (state.get('collapsed') or [])] if group_by else []

    columns = state.get('columns')
    if columns is not None:
        kept = [name for name in columns if name in fields]
        dropped += len(columns) - len(kept)
        narrowed['columns'] = kept or None
    else:
        narrowed['columns'] = None

    density = state.get('density')
    narrowed['density'] = density if density in DENSITIES else None
    return narrowed, dropped


def check_views(model, fields):
    problems = []
    keys = set()
    for view in declared_views(model):
        key = view.get('key')
        if not key or key in keys:
            problems.append(f'view {view.get("label")!r} needs a unique `key`.')
        keys.add(key)
        if not view.get('label'):
            problems.append(f'view {key!r} needs a `label`.')
        problems.extend(_filter_problems(view.get('filters', []), fields, f'view “{view.get("label")}”'))
        group_by = view.get('group_by')
        if group_by and (group_by not in fields or not groupable(fields[group_by])):
            problems.append(f'view “{view.get("label")}” groups by {group_by!r}, which can’t be grouped.')
    return problems
