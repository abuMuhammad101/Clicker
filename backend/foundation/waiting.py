"""
"Waiting for you": the records sitting in a state this person can move forward, with real counts.

Derived, never declared per module: for each model with a workflow, the transitions the user holds a grant for
(`foundation.workflow.granted`) that carry a record along its path (not the exits: cancel, reject) name the states
a record can be moved on from; the records in those states, *as this user may see them* (`data.access.scoped_queryset`:
record rules and all), are what is waiting. One grouped query per workflow model.

A transition that bars a user from their own record (`not_by`, "whoever requested it can't approve it") does not
count that record for them. A transition with a `when` condition (which approver applies) counts its source state:
some variant of it applies to every record there. Nothing here is urgent or timed; it is a count and a link.
"""
from django.apps import apps
from django.db.models import Count, Q
from rest_framework.response import Response
from rest_framework.views import APIView

from data.access import scoped_queryset
from foundation import workflow
from foundation.permissions import can
from schema.engine import is_exposed

MAX_CARDS = 12  # the home page shows four and says how many more; this only keeps the answer small


def waiting_for(user):
    """[{app_label, model, plural, state, state_label, count, actions, filter}], biggest first, none with a zero count."""
    cards = []
    for model in apps.get_models():
        if not is_exposed(model) or not can(user, model, 'view'):
            continue
        decl = workflow.declaration(model)
        if not decl:
            continue
        path = set(decl.get('path', []))
        by_state = {}
        for name in workflow.granted(user, model):
            spec = decl['transitions'][name]
            if spec['to'] not in path:
                continue  # an exit is not "waiting for you"
            for state in spec['from']:
                by_state.setdefault(state, []).append(spec)
        if not by_state:
            continue

        field = decl['field']
        aggregates = {}
        for index, (state, specs) in enumerate(by_state.items()):
            condition = Q(**{field: state})
            if all(workflow.not_by_fields(spec) for spec in specs):
                # Every move from here bars someone from their own record: leave out the ones that bar this user.
                barred = None
                for spec in specs:
                    any_field = Q()
                    for name in workflow.not_by_fields(spec):
                        any_field |= Q(**{name: user.pk})
                    barred = any_field if barred is None else barred & any_field
                condition &= ~barred
            aggregates[f's{index}'] = Count('pk', filter=condition)
        counts = scoped_queryset(user, model, 'view').order_by().aggregate(**aggregates)

        meta = model._meta
        for index, (state, specs) in enumerate(by_state.items()):
            count = counts[f's{index}']
            if not count:
                continue
            cards.append({
                'app_label': meta.app_label,
                'model': meta.model_name,
                # The schema's own words for one and for many (a model's verbose_name and its plural), never a guess.
                'singular': str(meta.verbose_name),
                'plural': str(meta.verbose_name_plural),
                'state': state,
                'state_label': workflow.state_label(model, state),
                'count': count,
                'actions': list(dict.fromkeys(workflow.action_verb(model, spec) for spec in specs)),
                'filter': f'{field}:in:{state}',
            })
    cards.sort(key=lambda card: (-card['count'], card['plural'], card['state']))
    return cards[:MAX_CARDS]


class WaitingView(APIView):
    """GET /api/home/waiting/: what is waiting for the person asking (View as role answers as that role)."""

    def get(self, request):
        return Response({'cards': waiting_for(request.user)})
