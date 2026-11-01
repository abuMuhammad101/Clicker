from django.http import Http404
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .engine import SCHEMA_MODES, build_registry, build_schema, get_exposed_model


class ModelSchemaView(APIView):
    """GET /api/schema/<app>/<model>/ — this user's schema, or 404 if they can't see the model."""

    def get(self, request, app_label, model_name):
        try:
            model = get_exposed_model(app_label, model_name)
        except LookupError:
            raise Http404('Not found.')
        mode = request.query_params.get('mode') or None
        if mode is not None and mode not in SCHEMA_MODES:
            raise ValidationError({'mode': [f'Use one of: {", ".join(SCHEMA_MODES)}.']})
        schema = build_schema(model, request.user, mode)
        if schema is None:
            raise Http404('Not found.')
        return Response(schema)


class RegistryView(APIView):
    """GET /api/registry/ — the modules and models this user may view, for navigation."""

    def get(self, request):
        return Response({'apps': build_registry(request.user)})
