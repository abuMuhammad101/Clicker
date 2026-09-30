"""
Generic record API for every model that declares a `Schema` class:

    GET   /api/data/<app>/<model>/              list
    POST  /api/data/<app>/<model>/              create
    GET   /api/data/<app>/<model>/<pk>/         retrieve
    PATCH /api/data/<app>/<model>/<pk>/         update (partial)
    GET   /api/data/<app>/<model>/search/?q=    picker search

No per-model code anywhere in this file. Delete is deliberately absent: the
spec's intended path is archiving (`active = false`), and a delete endpoint
will be designed with PROTECT errors in mind when something needs it.
"""
from django.db import models as djm
from django.db.models import F, Q, Value
from django.db.models.functions import Lower, NullIf
from django.http import Http404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from schema.engine import build_schema, display_label, get_exposed_model

from .serializers import serialize_record, serializer_for

DEFAULT_LIMIT = 20
MAX_LIMIT = 50
LIST_DEFAULT_LIMIT = 50
LIST_MAX_LIMIT = 200


def _resolve(app_label, model_name):
    try:
        return get_exposed_model(app_label, model_name)
    except LookupError:
        raise Http404(f'No model registered as {app_label}.{model_name}')


def _queryset(model, schema):
    # Every many_to_one label in the envelope touches its related row —
    # fetch them in the same query instead of one query per relation.
    relations = [name for name, f in schema['fields'].items() if f['type'] == 'many_to_one']
    return model.objects.select_related(*relations)


def _int_param(request, name, default, maximum=None):
    try:
        value = int(request.GET.get(name, default))
    except ValueError:
        return default
    value = max(value, 0)
    return min(value, maximum) if maximum is not None else value


def _search(queryset, schema, query):
    """Case-insensitive contains across the schema's search_fields."""
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


def _sort_expressions(model, name, desc):
    """
    One column's sort, as order_by expressions. Empty values go last in
    both directions: a user sorting a column wants to see values, and the
    blanks are never what they're looking for.

    A many_to_one sorts by its target's Meta.ordering — "sort by country"
    means by country name, not by id.
    """
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


def _ordering(model, schema, param):
    """
    `?ordering=name,-city` → order_by expressions. Only names the schema
    knows are accepted; anything else is dropped rather than raising. With
    no usable ordering, the schema's own list_sort applies.

    The primary key is always the final tiebreaker. The list is fetched in
    windows by offset, and without a total order two rows that tie on the
    sort key could swap between requests: one appears twice, one never.
    """
    fields = schema['fields']
    requested = []
    for part in (param or '').split(','):
        part = part.strip()
        if part.lstrip('-') in fields:
            requested.append((part.lstrip('-'), part.startswith('-')))
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


class ModelRecordListView(APIView):
    def get(self, request, app_label, model_name):
        model = _resolve(app_label, model_name)
        schema = build_schema(model)
        queryset = _search(_queryset(model, schema), schema, request.GET.get('q', ''))
        queryset = queryset.order_by(*_ordering(model, schema, request.GET.get('ordering')))

        limit = _int_param(request, 'limit', LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT)
        offset = _int_param(request, 'offset', 0)

        return Response({
            'count': queryset.count(),
            'results': [serialize_record(obj, schema) for obj in queryset[offset:offset + limit]],
        })

    def post(self, request, app_label, model_name):
        model = _resolve(app_label, model_name)
        serializer = serializer_for(model)(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        return Response(serialize_record(obj), status=status.HTTP_201_CREATED)


class ModelRecordDetailView(APIView):
    def _get_object(self, model, schema, pk):
        try:
            return _queryset(model, schema).get(pk=pk)
        except model.DoesNotExist:
            raise Http404(f'No {model._meta.verbose_name} with id {pk}')

    def get(self, request, app_label, model_name, pk):
        model = _resolve(app_label, model_name)
        schema = build_schema(model)
        return Response(serialize_record(self._get_object(model, schema, pk), schema))

    def patch(self, request, app_label, model_name, pk):
        model = _resolve(app_label, model_name)
        schema = build_schema(model)
        obj = self._get_object(model, schema, pk)
        serializer = serializer_for(model)(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        # Re-read so relation labels and the display name reflect the save
        # (a changed parent changes a person's display name).
        return Response(serialize_record(self._get_object(model, schema, obj.pk), schema))


class ModelSearchView(APIView):
    """
    Read-only search for picker components — the many_to_one field's async
    search. Reuses the schema engine's own search_fields and display label
    so there is no second, model-specific declaration of what "search" or
    "label" means for a given model.
    """

    def get(self, request, app_label, model_name):
        model = _resolve(app_label, model_name)
        schema = build_schema(model)
        queryset = _search(model.objects.all(), schema, request.GET.get('q', ''))

        # Domain filters (e.g. ?type=company for the parent picker) — exact
        # match, and only against field names the schema actually knows
        # about. Anything else in the query string is silently ignored
        # rather than raising, since arbitrary junk in a search box's
        # request shouldn't 500 the picker.
        valid_fields = set(schema['fields'].keys())
        filters = {
            key: value
            for key, value in request.GET.items()
            if key in valid_fields
        }
        if filters:
            queryset = queryset.filter(**filters)

        limit = _int_param(request, 'limit', DEFAULT_LIMIT, MAX_LIMIT)

        results = [
            {'value': obj.pk, 'label': display_label(obj)}
            for obj in queryset[:limit]
        ]
        return Response(results)
