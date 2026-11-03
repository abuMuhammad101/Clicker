"""
Running a workflow transition: the only way a record's state moves.

    POST /api/data/<app>/<model>/<pk>/transitions/<name>/

Answers, in this order, so each says exactly one thing:

- **404** the record isn't visible to this user, or the model has no such
  transition (an unknown name reveals nothing).
- **403** the user lacks the transition's grant.
- **409** the record's state doesn't allow it ("this invoice is Posted").
- **403** the user is barred by `not_by` (whoever requested it can't approve it).

The state change, the actor stamp and the audit entry commit together, under
a row lock, so two people pressing "Approve" at once can't both succeed.
"""
from django.http import Http404
from rest_framework.exceptions import PermissionDenied

from foundation import actions, workflow

from .access import get_record

NO_GRANT = 'You don’t have permission to do this.'

# The same refusal the rest of the data layer raises: a 409 with a sentence.
Conflict = actions.Refused


def run_transition(user, model, pk, name, *, ip_address, audited_fields=None):
    decl = workflow.declaration(model)
    obj = get_record(user, model, pk)  # 404 if the record isn't visible
    if not decl or name not in decl['transitions']:
        raise Http404('Not found.')
    if not workflow.may_run(user, model, name):
        raise PermissionDenied(NO_GRANT)

    # The state, `when` and `not_by` answer here, in the order the docstring
    # promises; the transition's own `check`, its side effects and the audit
    # entry follow, in one transaction (foundation.actions.perform_transition).
    spec = decl['transitions'][name]
    if workflow.state_of(obj) not in spec['from'] or not workflow.applies(obj, spec):
        raise Conflict(workflow.blocked_reason(user, obj, name, check=False))
    barred = workflow.barred_reason(user, obj, spec)
    if barred:
        raise PermissionDenied(barred)
    return actions.perform_transition(actions.Context(user, ip_address), obj, name)
