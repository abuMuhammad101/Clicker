"""
Guided tours as data. `tours/<journey>.json` at the repository root holds a manifest per journey: steps with a
`target` (a `data-tour` anchor the generic renderers emit), a title and a body, and what the step `requires`. This
endpoint sends the signed-in person only the steps they may see: a step that needs a model they cannot view, or a
permission they lack, is never sent (and so can never leak what exists). View as role answers as that role.

`requires` entries are "app.model" (the person may view that model) or "app.permission" (the person holds it).
"""
import json
from pathlib import Path

from django.apps import apps
from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from foundation.permissions import can

TOURS_DIR = Path(settings.BASE_DIR).parent / 'tours'


def load_manifest(journey):
    path = TOURS_DIR / f'{journey}.json'
    if not journey or not path.is_file():
        return None
    return json.loads(path.read_text(encoding='utf-8'))


def _allowed(user, requirement):
    app_label, _, name = requirement.partition('.')
    try:
        model = apps.get_model(app_label, name)
    except LookupError:
        return user.has_perm(requirement)
    return can(user, model, 'view')


def tour_for(user, journey):
    manifest = load_manifest(journey)
    if manifest is None:
        return None
    steps = [step for step in manifest['steps'] if all(_allowed(user, r) for r in step.get('requires', []))]
    return {'id': manifest['id'], 'title': manifest['title'], 'steps': steps, 'ending': manifest.get('ending', '')}


class TourView(APIView):
    """GET /api/tour/: this journey's tour, narrowed to what the person asking may see (null when there is none)."""

    def get(self, request):
        return Response({'tour': tour_for(request.user, settings.CLICKER_JOURNEY)})
