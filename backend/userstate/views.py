import json
import re

from django.apps import apps
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from schema.engine import _sentence_case, display_label, is_exposed

from .models import RecordView, UserPreference

RECENTS_LIMIT = 20
PREFERENCE_KEY = re.compile(r'^[a-z][a-z0-9_.-]{0,63}$')
PREFERENCE_MAX_BYTES = 8 * 1024


class RecentsView(APIView):
    """
    GET /api/recents/ — what the signed-in user looked at most recently.

    Resolved against what exists and is exposed now: a record that's been
    deleted, or a model that's no longer opted in, simply drops out rather
    than leaving a dead row.
    """

    def get(self, request):
        results = []
        views = RecordView.objects.filter(user=request.user).select_related('content_type')
        for view in views[: RECENTS_LIMIT * 3]:
            model = view.content_type.model_class()
            if model is None or not is_exposed(model):
                continue
            obj = model.objects.filter(pk=view.object_id).first()
            if obj is None:
                continue
            app_config = apps.get_app_config(model._meta.app_label)
            results.append({
                'app_label': model._meta.app_label,
                'app': _sentence_case(app_config.verbose_name),
                'model': model._meta.model_name,
                'model_label': _sentence_case(model._meta.verbose_name),
                'id': obj.pk,
                'display': display_label(obj),
                'viewed_at': view.viewed_at,
            })
            if len(results) == RECENTS_LIMIT:
                break
        return Response({'results': results})


class PreferenceView(APIView):
    """GET/PUT /api/preferences/<key>/ — one JSON value per user per key."""

    @staticmethod
    def _check_key(key):
        if not PREFERENCE_KEY.match(key):
            raise ValidationError({'key': ['Not a valid preference key.']})

    def get(self, request, key):
        self._check_key(key)
        preference = UserPreference.objects.filter(user=request.user, key=key).first()
        return Response({'value': preference.value if preference else None})

    def put(self, request, key):
        self._check_key(key)
        if 'value' not in request.data:
            raise ValidationError({'value': ['This field is required.']})
        value = request.data['value']
        if len(json.dumps(value)) > PREFERENCE_MAX_BYTES:
            raise ValidationError({'value': ['Too large.']})
        UserPreference.objects.update_or_create(user=request.user, key=key, defaults={'value': value})
        return Response({'value': value})
