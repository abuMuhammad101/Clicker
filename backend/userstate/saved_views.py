"""
Saved views of a list:

    GET    /api/views/<app>/<model>/        module views, then this user's, then shared ones
    POST   /api/views/<app>/<model>/        save the current state under a name
    PATCH  /api/views/<app>/<model>/<id>/   update your own view (state, label, shared)
    DELETE /api/views/<app>/<model>/<id>/   remove your own view

Every view is narrowed to the reader's schema as it's served
(`data.query.narrow_view`): a filter, sort, grouping or column on a field the
reader can't read is dropped, and `dropped` says how many parts were. The
list endpoint enforces the same rules again on whatever is applied, so a view
can never widen anyone's access.
"""
import json

from django.db import IntegrityError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from data import query
from schema.engine import build_schema, get_exposed_model

from .models import SavedView

MAX_STATE_BYTES = 8 * 1024
MAX_LABEL = 80


def _schema(user, app_label, model_name):
    try:
        model = get_exposed_model(app_label, model_name)
    except LookupError:
        raise Http404('Not found.')
    schema = build_schema(model, user)
    if schema is None:
        raise Http404('Not found.')
    return model, schema


def _owner_name(user):
    return user.get_full_name() or user.username


def _serialize(view, user, fields):
    state, dropped = query.narrow_view(view.state, fields)
    mine = view.owner_id == user.pk
    return {
        'id': str(view.pk),
        'label': view.label,
        'kind': 'personal' if mine else 'shared',
        'owner': None if mine else _owner_name(view.owner),
        'shared': view.shared,
        'editable': mine,
        'state': state,
        'dropped': dropped,
    }


def _clean_label(value):
    label = str(value or '').strip()
    if not label:
        raise ValidationError({'label': ['Give the view a name.']})
    if len(label) > MAX_LABEL:
        raise ValidationError({'label': [f'Keep the name under {MAX_LABEL} characters.']})
    return label


def _clean_state(value, fields):
    if not isinstance(value, dict):
        raise ValidationError({'state': ['Not a list state.']})
    if len(json.dumps(value)) > MAX_STATE_BYTES:
        raise ValidationError({'state': ['Too large.']})
    # Every filter must parse for this user: a view is saved only as the
    # person saving it could apply it.
    query.parse_filters(value.get('filters') or [], fields)
    state, _ = query.narrow_view(value, fields)
    return state


def _duplicate():
    return ValidationError({'label': ['You already have a view with this name.']})


class SavedViewListView(APIView):
    def get(self, request, app_label, model_name):
        model, schema = _schema(request.user, app_label, model_name)
        fields = schema['fields']
        views = []
        for declared in query.declared_views(model):
            state, dropped = query.narrow_view(declared, fields)
            views.append({
                'id': f'module:{declared["key"]}',
                'label': declared['label'],
                'kind': 'module',
                'owner': None,
                'shared': True,
                'editable': False,
                'state': state,
                'dropped': dropped,
            })
        rows = SavedView.objects.filter(app_label=app_label, model_name=model_name).select_related('owner')
        own = [v for v in rows if v.owner_id == request.user.pk]
        shared = [v for v in rows if v.owner_id != request.user.pk and v.shared]
        views += [_serialize(v, request.user, fields) for v in [*own, *shared]]
        return Response({'views': views})

    def post(self, request, app_label, model_name):
        _, schema = _schema(request.user, app_label, model_name)
        try:
            view = SavedView.objects.create(
                owner=request.user,
                app_label=app_label,
                model_name=model_name,
                label=_clean_label(request.data.get('label')),
                state=_clean_state(request.data.get('state'), schema['fields']),
                shared=bool(request.data.get('shared', False)),
            )
        except IntegrityError:
            raise _duplicate()
        return Response(_serialize(view, request.user, schema['fields']), status=status.HTTP_201_CREATED)


class SavedViewDetailView(APIView):
    @staticmethod
    def _own(request, app_label, model_name, pk):
        # Someone else's view, shared or not, isn't yours to change: 404.
        view = SavedView.objects.filter(
            pk=pk, owner=request.user, app_label=app_label, model_name=model_name
        ).first()
        if view is None:
            raise Http404('Not found.')
        return view

    def patch(self, request, app_label, model_name, pk):
        _, schema = _schema(request.user, app_label, model_name)
        view = self._own(request, app_label, model_name, pk)
        if 'label' in request.data:
            view.label = _clean_label(request.data['label'])
        if 'state' in request.data:
            view.state = _clean_state(request.data['state'], schema['fields'])
        if 'shared' in request.data:
            view.shared = bool(request.data['shared'])
        try:
            view.save()
        except IntegrityError:
            raise _duplicate()
        return Response(_serialize(view, request.user, schema['fields']))

    def delete(self, request, app_label, model_name, pk):
        _schema(request.user, app_label, model_name)
        self._own(request, app_label, model_name, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
