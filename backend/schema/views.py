from django.http import Http404
from rest_framework.response import Response
from rest_framework.views import APIView

from .engine import build_schema, get_exposed_model


class ModelSchemaView(APIView):
    def get(self, request, app_label, model_name):
        try:
            model = get_exposed_model(app_label, model_name)
        except LookupError:
            raise Http404(f'No model registered as {app_label}.{model_name}')
        return Response(build_schema(model))
