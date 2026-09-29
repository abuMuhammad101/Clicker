"""
Minimal read-only search for picker components — the many_to_one field's
async search, specifically. Not the CRUD API step 6 will need; deliberately
narrow. Reuses the schema engine's own search_fields and display_field so
there is no second, model-specific declaration of what "search" or "label"
means for a given model.
"""
from django.apps import apps
from django.db.models import Q
from django.http import Http404
from rest_framework.response import Response
from rest_framework.views import APIView

from schema.engine import build_schema

DEFAULT_LIMIT = 20
MAX_LIMIT = 50


class ModelSearchView(APIView):
    def get(self, request, app_label, model_name):
        try:
            model = apps.get_model(app_label, model_name)
        except LookupError:
            raise Http404(f'No model registered as {app_label}.{model_name}')

        schema = build_schema(model)
        search_fields = schema['list']['search_fields']
        display_field = schema['display_field'] or 'pk'

        queryset = model.objects.all()

        query = request.GET.get('q', '').strip()
        if query and search_fields:
            condition = Q()
            for field_name in search_fields:
                condition |= Q(**{f'{field_name}__icontains': query})
            queryset = queryset.filter(condition)

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

        try:
            limit = min(int(request.GET.get('limit', DEFAULT_LIMIT)), MAX_LIMIT)
        except ValueError:
            limit = DEFAULT_LIMIT

        results = [
            {'value': obj.pk, 'label': str(getattr(obj, display_field))}
            for obj in queryset[:limit]
        ]
        return Response(results)
