"""
Generic record API for every model that declares a `Schema` class:

    GET   /api/data/<app>/<model>/              list (?filter=field:op:value, see data.query)
    GET   /api/data/<app>/<model>/aggregate/    group headers and summaries for the same filters
    POST  /api/data/<app>/<model>/              create
    GET   /api/data/<app>/<model>/<pk>/         retrieve
    PATCH /api/data/<app>/<model>/<pk>/         update (partial)
    GET   /api/data/<app>/<model>/search/?q=    picker search
    GET   /api/data/<app>/<model>/<pk>/history/ the record's audit trail
    POST  /api/data/<app>/<model>/<pk>/transitions/<name>/ move its workflow state

No per-model code anywhere in this file. Delete is deliberately absent: the
spec's intended path is archiving (`active = false`), and a delete endpoint
will be designed with PROTECT errors in mind when something needs it.

Every path gets its rows from `data.access` (the one enforcement point) and
its field set from the schema built for the requesting user. Nothing here
reaches for a model's manager directly.
"""
from django.db import models as djm
from django.db import IntegrityError, transaction
from django.db.models import F, Q, Value
from django.db.models.functions import Lower, NullIf
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from foundation import computed as computed_fields
from foundation import actions, numbering, workflow
from foundation.audit import client_ip, history_for, record_change, snapshot
from foundation.models import AuditEntry, ClickerModel
from schema.engine import build_schema, display_label, get_exposed_model, schema_field_names
from userstate.services import record_view

from . import query
from .access import get_record, readable_fields, scoped_queryset, visible_labels, visible_related_ids, writable_fields
from .serializers import serialize_record, serializer_for
from .transitions import Conflict, run_transition

DEFAULT_LIMIT = 20
MAX_LIMIT = 50
LIST_DEFAULT_LIMIT = 50
LIST_MAX_LIMIT = 200


def _resolve(app_label, model_name):
    try:
        return get_exposed_model(app_label, model_name)
    except LookupError:
        raise Http404('Not found.')


def _user_schema(user, model):
    """The schema this user gets, or 404 if they can't see the model."""
    schema = build_schema(model, user)
    if schema is None:
        raise Http404('Not found.')
    return schema


def _with_relations(queryset, schema, model):
    # Every many_to_one label in the envelope touches its related row —
    # fetch them in the same query instead of one query per relation. So do
    # the record's created_by / updated_by (its `meta`).
    relations = [
        name for name, f in schema['fields'].items() if f['type'] == 'many_to_one' and 'computed' not in f
    ]
    if issubclass(model, ClickerModel):
        relations += ['created_by', 'updated_by']
    return queryset.select_related(*relations)


class _unique_as_conflict:
    """
    A uniqueness rule the database enforces (two people saving the same bank
    reference at the same instant) is a refusal with a sentence, not a 500.
    """

    def __enter__(self):
        return self

    def __exit__(self, kind, error, trace):
        if kind is IntegrityError:
            raise actions.Refused('Someone else just saved the same value. Reload and check.') from error
        return False


def _envelopes(user, model, schema, records, checks=False):
    records = list(records)
    visible = visible_related_ids(user, model, schema, records)
    envelopes = [serialize_record(record, schema, visible) for record in records]
    if schema.get('workflow'):
        # Per record: which transitions this user may run on it now, whether
        # its state refuses edits, and who it's waiting for. The header shows
        # exactly these.
        roles_cache = {}
        for envelope, record in zip(envelopes, records):
            envelope['workflow'] = workflow.record_status(user, record, roles_cache, checks)
    return envelopes


def _envelope(user, model, schema, record):
    # One record: its form can evaluate each transition's own check; a list can't afford to.
    envelope = _envelopes(user, model, schema, [record], checks=True)[0]
    if schema.get('record_summaries'):
        # The record's own figures (Schema.record_summaries), one aggregate query.
        queryset = scoped_queryset(user, model, 'view').filter(pk=record.pk)
        envelope['summaries'] = query.record_summaries(queryset, model, schema['fields'])
    return envelope


def _server_owned(user, model, creating):
    """
    The values the data layer sets on every write, never the client: who
    created the record (on create) and who changed it last.
    """
    if not issubclass(model, ClickerModel):
        return {}
    values = {'updated_by': user}
    if creating:
        values['created_by'] = user
    return values


def _audited_fields(model):
    """What the audit log records for a model: every field a schema can show (minus the pk)."""
    pk = model._meta.pk.name
    return [name for name in schema_field_names(model) if name != pk]


def _int_param(request, name, default, maximum=None):
    try:
        value = int(request.GET.get(name, default))
    except ValueError:
        return default
    value = max(value, 0)
    return min(value, maximum) if maximum is not None else value


def _coerce_domain_value(field, value):
    """
    Everything off a query string is a string — `?is_vendor=true` arrives
    as the Python string 'true', not a bool. Most field types accept that
    fine (CharField, IntegerField's own lookup), but BooleanField does not:
    filtering a boolean field by the string 'true' raises ValidationError,
    it doesn't coerce. A domain filter on a boolean field would 500 the picker
    without this.
    """
    if isinstance(field, djm.BooleanField):
        return value.strip().lower() in ('1', 'true', 't', 'yes')
    return value


def _search(queryset, schema, query):
    """
    Case-insensitive contains across the schema's search_fields. The schema
    is the user's, so a field they can't read is never searched: matching on
    it would reveal what's in it.
    """
    query = query.strip()
    search_fields = schema['list']['search_fields']
    if not query or not search_fields:
        return queryset
    condition = Q()
    for field_name in search_fields:
        condition |= Q(**{f'{field_name}__icontains': query})
    return queryset.filter(condition)


def _sort_key(field, path):
    """
    The expression to sort one concrete field by. Text sorts
    case-insensitively ("karachi" belongs next to "Karachi", not after
    "Toronto"), and an empty string counts as no value, same as NULL.
    """
    if isinstance(field, (djm.CharField, djm.TextField)):
        return NullIf(Lower(path), Value(''))
    return F(path)


def _field_filters(request, model, schema):
    """
    `?type=company&parent=5` → exact-match filters, for the list and the
    picker alike: the first brick of S-4's filter bar. Only fields the user
    can read (computed ones included); any other key is refused, never
    ignored, because a filter on a hidden field would let a client guess its
    values one request at a time.
    """
    readable = schema['fields']
    refused = sorted(key for key in request.GET if key not in RESERVED_PARAMS and key not in readable)
    if refused:
        raise ValidationError({key: [NOT_FILTERABLE] for key in refused})
    filters = {}
    for key, value in request.GET.items():
        if key in RESERVED_PARAMS:
            continue
        if 'computed' in readable[key]:
            filters[key] = value
        else:
            filters[key] = _coerce_domain_value(model._meta.get_field(key), value)
    return filters


def _sort_expressions(model, name, desc):
    """
    One column's sort, as order_by expressions. Empty values go last in
    both directions: a user sorting a column wants to see values, and the
    blanks are never what they're looking for.

    A many_to_one sorts by its target's Meta.ordering — "sort by country"
    means by country name, not by id.
    """
    if name in computed_fields.declarations(model):
        # A computed field is an annotation on the scoped queryset: sort by it
        # in the database like any column.
        expr = F(name)
        return [expr.desc(nulls_last=True) if desc else expr.asc(nulls_last=True)]
    field = model._meta.get_field(name)
    if isinstance(field, djm.ForeignKey):
        related = field.related_model
        keys = [(key.lstrip('-'), key.startswith('-')) for key in related._meta.ordering or ['pk']]
        targets = [
            (_sort_key(related._meta.get_field(key), f'{name}__{key}') if key != 'pk' else F(f'{name}__pk'), key_desc)
            for key, key_desc in keys
        ]
    else:
        targets = [(_sort_key(field, name), False)]

    return [
        expr.desc(nulls_last=True) if desc != key_desc else expr.asc(nulls_last=True)
        for expr, key_desc in targets
    ]


# Query parameters the endpoints read themselves; everything else in a search
# request's query string is a field filter.
RESERVED_PARAMS = {'q', 'limit', 'offset', 'ordering', 'filter', 'group_by'}

# One message for a field that doesn't exist and one the user can't read:
# telling them apart would confirm a hidden field exists.
NOT_SORTABLE = 'You can’t sort by this field.'
NOT_FILTERABLE = 'You can’t filter by this field.'


def _ordering(model, schema, param):
    """
    `?ordering=name,-city` → order_by expressions. Only fields the user can
    read may be sorted by: sorting on a hidden field would reveal its values
    by their order. Any other name is refused with a 400, never silently
    ignored. With no ordering requested, the schema's own list_sort applies.

    The primary key is always the final tiebreaker. The list is fetched in
    windows by offset, and without a total order two rows that tie on the
    sort key could swap between requests: one appears twice, one never.
    """
    fields = schema['fields']
    requested = []
    for part in (param or '').split(','):
        part = part.strip()
        if not part:
            continue
        name = part.lstrip('-')
        if name not in fields:
            raise ValidationError({'ordering': [NOT_SORTABLE]})
        requested.append((name, part.startswith('-')))
    if not requested:
        requested = [
            (sort['field'], sort['direction'] == 'desc')
            for sort in schema['list']['sort']
            if sort['field'] in fields
        ]

    expressions = []
    for name, desc in requested:
        expressions.extend(_sort_expressions(model, name, desc))
    return [*expressions, 'pk']


def _unarchived(queryset, schema, filters):
    """
    Archived records stay out of lists and pickers unless the request asks
    about the archive field itself (`?active=false` lists the archived ones)
    or names a record by id (a link's label must resolve even if archived).
    """
    field = schema.get('archive_field')
    if not field or field in filters or 'id' in filters:
        return queryset
    return queryset.filter(**{field: True})


def _list_queryset(request, model, schema):
    """
    The scoped rows a list asks for: its `?filter=` grammar (data.query), the
    older exact `?field=value` filters a related list uses, archived records
    left out unless asked about, and the search box. The list and its
    aggregates share it, so a count, a group total and a summary always
    describe exactly the rows on screen.
    """
    fields = schema['fields']
    exact = _field_filters(request, model, schema)
    parsed = query.parse_filters(request.GET.getlist('filter'), fields)
    queryset = query.apply_filters(scoped_queryset(request.user, model, 'view').filter(**exact), parsed, fields)
    queryset = _unarchived(queryset, schema, set(exact) | {item.field for item in parsed})
    return _search(queryset, schema, request.GET.get('q', ''))


class ModelRecordListView(APIView):
    def get(self, request, app_label, model_name):
        model = _resolve(app_label, model_name)
        schema = _user_schema(request.user, model)
        queryset = _with_relations(_list_queryset(request, model, schema), schema, model)
        queryset = queryset.order_by(*_ordering(model, schema, request.GET.get('ordering')))

        limit = _int_param(request, 'limit', LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT)
        offset = _int_param(request, 'offset', 0)

        return Response({
            'count': queryset.count(),
            'results': _envelopes(request.user, model, schema, queryset[offset:offset + limit]),
        })

    def post(self, request, app_label, model_name):
        model = _resolve(app_label, model_name)
        schema = _user_schema(request.user, model)
        scoped_queryset(request.user, model, 'add')
        serializer = serializer_for(model, writable_fields(request.user, model, 'add'), request.user)(data=request.data)
        serializer.is_valid(raise_exception=True)
        # The record and its audit entry commit together or not at all. Its
        # document number, if it has one, is taken inside the same
        # transaction, so a failed create never uses one up.
        ctx = actions.Context(request.user, client_ip(request))
        with _unique_as_conflict(), transaction.atomic():
            obj = serializer.save(**_server_owned(request.user, model, creating=True), **numbering.assigned_values(model))
            # The model's own follow-up (a bill's due date, its parent's total),
            # in the same transaction, before the entry says what the record is.
            actions.after_save(obj, ctx, created=True)
            obj.refresh_from_db()
            record_change(
                actor=request.user,
                ip_address=client_ip(request),
                obj=obj,
                action=AuditEntry.ACTION_CREATE,
                before=None,
                after=snapshot(obj, _audited_fields(model)),
            )
        return Response(
            _envelope(request.user, model, schema, get_record(request.user, model, obj.pk)),
            status=status.HTTP_201_CREATED,
        )


class ModelAggregateView(APIView):
    """
    GET /api/data/<app>/<model>/aggregate/?filter=…&q=…&group_by=…

    For the same rows the list shows: the model's summaries (Schema.summaries)
    and, with `group_by`, one header per group with its count and money sums.
    Each is one aggregate query in the database, however many groups.
    """

    def get(self, request, app_label, model_name):
        model = _resolve(app_label, model_name)
        schema = _user_schema(request.user, model)
        fields = schema['fields']
        queryset = _list_queryset(request, model, schema)
        result = {'summaries': query.summaries(queryset, model, fields), 'groups': None}
        group_by = request.GET.get('group_by')
        if group_by:
            result['groups'] = query.groups(
                queryset, model, fields, group_by, labels_for=lambda name, ids: visible_labels(request.user, model, name, ids)
            )
        return Response(result)


class ModelRecordDetailView(APIView):
    def get(self, request, app_label, model_name, pk):
        model = _resolve(app_label, model_name)
        schema = _user_schema(request.user, model)
        obj = _with_relations(scoped_queryset(request.user, model, 'view'), schema, model).filter(pk=pk).first()
        if obj is None:
            raise Http404('Not found.')
        # Opening a record, on any surface, is what the Recents home shows.
        # Recorded here rather than by a surface, so a new surface can't forget.
        record_view(request.user, obj)
        return Response(_envelope(request.user, model, schema, obj))

    def patch(self, request, app_label, model_name, pk):
        model = _resolve(app_label, model_name)
        schema = _user_schema(request.user, model)
        obj = get_record(request.user, model, pk, 'change')
        if workflow.is_locked(obj):
            # A posted document is reversed, never edited.
            raise Conflict(
                f'This {model._meta.verbose_name} is {workflow.state_label(model, workflow.state_of(obj))}, '
                'so it can’t be edited.'
            )
        writable = writable_fields(request.user, model, 'change')
        archive_field = schema.get('archive_field')
        if archive_field and getattr(obj, archive_field) is False:
            # Archived means read-only until restored: the only write is the restore.
            if not (set(request.data) == {archive_field} and request.data[archive_field] is True):
                raise actions.Refused(
                    f'This {model._meta.verbose_name} is archived, so it can’t be edited. Restore it first.'
                )
        serializer = serializer_for(model, writable, request.user)(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        fields = _audited_fields(model)
        # The change and its audit entry commit together or not at all. The
        # row is locked while it's read and written, so two saves at once
        # can't record the same "before".
        ctx = actions.Context(request.user, client_ip(request))
        with _unique_as_conflict(), transaction.atomic():
            locked = scoped_queryset(request.user, model, 'change').select_for_update().get(pk=obj.pk)
            before = snapshot(locked, fields)
            serializer.instance = locked
            obj = serializer.save(**_server_owned(request.user, model, creating=False))
            actions.after_save(obj, ctx, created=False)
            obj.refresh_from_db()
            record_change(
                actor=request.user,
                ip_address=client_ip(request),
                obj=obj,
                action=AuditEntry.ACTION_UPDATE,
                before=before,
                after=snapshot(obj, fields),
            )
        # Re-read so relation labels and the display name reflect the save
        # (a changed parent changes a person's display name).
        return Response(_envelope(request.user, model, schema, get_record(request.user, model, obj.pk)))


class ModelRecordTransitionView(APIView):
    """POST /api/data/<app>/<model>/<pk>/transitions/<name>/ — move a record's state (see data.transitions)."""

    def post(self, request, app_label, model_name, pk, name):
        model = _resolve(app_label, model_name)
        schema = _user_schema(request.user, model)
        obj = run_transition(
            request.user, model, pk, name, ip_address=client_ip(request), audited_fields=_audited_fields(model)
        )
        return Response(_envelope(request.user, model, schema, get_record(request.user, model, obj.pk)))


class ModelRecordHistoryView(APIView):
    """
    GET /api/data/<app>/<model>/<pk>/history/ — the record's audit trail,
    newest first. Anyone who can see the record can read its history, but
    only the changes to fields they can read: hidden values stay hidden in
    their before/after too.
    """

    def get(self, request, app_label, model_name, pk):
        model = _resolve(app_label, model_name)
        obj = get_record(request.user, model, pk)
        return Response({
            'results': history_for(
                obj,
                readable_fields(request.user, model),
                labels_for=lambda name, ids: visible_labels(request.user, model, name, ids),
            )
        })


class ModelSearchView(APIView):
    """
    Read-only search for picker components — the many_to_one field's async
    search. Reuses the schema engine's own search_fields and display label
    so there is no second, model-specific declaration of what "search" or
    "label" means for a given model.
    """

    def get(self, request, app_label, model_name):
        model = _resolve(app_label, model_name)
        schema = _user_schema(request.user, model)
        # Domain filters (e.g. ?type=company for the parent picker, or
        # ?is_vendor=true for a boolean one): the same readable-fields-only
        # filters as the list.
        queryset = _list_queryset(request, model, schema)

        limit = _int_param(request, 'limit', DEFAULT_LIMIT, MAX_LIMIT)

        results = [
            {'value': obj.pk, 'label': display_label(obj)}
            for obj in queryset[:limit]
        ]
        return Response(results)
