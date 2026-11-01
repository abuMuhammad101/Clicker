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
from django.db import transaction
from django.http import Http404
from rest_framework.exceptions import APIException, PermissionDenied

from foundation import workflow
from foundation.audit import record_change, snapshot
from foundation.models import AuditEntry, ClickerModel

from .access import get_record, scoped_queryset

NO_GRANT = 'You don’t have permission to do this.'


class Conflict(APIException):
    status_code = 409
    default_detail = 'This can’t be done in the record’s current state.'
    default_code = 'conflict'


def run_transition(user, model, pk, name, *, ip_address, audited_fields):
    decl = workflow.declaration(model)
    get_record(user, model, pk)  # 404 if the record isn't visible
    if not decl or name not in decl['transitions']:
        raise Http404('Not found.')
    if not workflow.may_run(user, model, name):
        raise PermissionDenied(NO_GRANT)

    spec = decl['transitions'][name]
    with transaction.atomic():
        obj = scoped_queryset(user, model, 'view').select_for_update().get(pk=pk)
        before = snapshot(obj, audited_fields)
        state = workflow.state_of(obj)
        if state not in spec['from']:
            raise Conflict(workflow.blocked_reason(user, obj, name))
        reason = workflow.blocked_reason(user, obj, name)
        if reason:
            raise PermissionDenied(reason)

        setattr(obj, decl['field'], spec['to'])
        changed = [decl['field']]
        if spec.get('records_actor'):
            setattr(obj, spec['records_actor'], user)
            changed.append(spec['records_actor'])
        if isinstance(obj, ClickerModel):
            obj.updated_by = user
            changed += ['updated_by', 'updated_at']
        obj.save(update_fields=changed)
        record_change(
            actor=user,
            ip_address=ip_address,
            obj=obj,
            action=AuditEntry.ACTION_TRANSITION,
            before=before,
            after=snapshot(obj, audited_fields),
        )
    return obj
