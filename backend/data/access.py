"""
The one enforcement point for record access.

Every list, detail, search, create and update path asks this module for its
queryset and its field sets. No view builds a queryset for an exposed model
any other way (a test in data/tests.py fails if one does).

Two answers, kept apart on purpose:

- **404** when the user can't see the model or the record at all. A record
  you can't see doesn't exist, as far as you can tell: no "forbidden" that
  confirms it's there.
- **403** when the user can see it but may not do this to it (view but not
  change, for instance).

Everything takes the user explicitly, never `request.user`, so the same
answers can be computed for "View as role" (S-6).

Later sessions plug in here, and only here:
- record rules ("this officer sees only his towns") narrow the queryset in
  `scoped_queryset`;
- tenancy (company) narrows it the same way, before record rules.
"""
from django.http import Http404
from rest_framework.exceptions import PermissionDenied

from foundation.permissions import READ, WRITE, can, field_access


def _schema_field_names(model):
    # Imported lazily: the schema engine imports this module's sibling rules.
    from schema.engine import schema_field_names

    return schema_field_names(model)


def scoped_queryset(user, model, action='view'):
    """
    The rows `user` may act on with `action`. Raises 404 when they can't see
    the model at all, 403 when they can see it but may not `action` it.

    For `add` the queryset is not used for a lookup; the call is the
    permission check, and the place a future record rule will validate the
    new row against.
    """
    if not can(user, model, 'view'):
        raise Http404('Not found.')
    if action != 'view' and not can(user, model, action):
        raise PermissionDenied('You don’t have permission to do this.')

    queryset = model._default_manager.all()
    # S-6+: tenancy, then record rules, narrow `queryset` here.
    return queryset


def get_record(user, model, pk, action='view'):
    """One record through the scope, or 404 (including "exists but not yours")."""
    queryset = scoped_queryset(user, model, 'view')
    try:
        obj = queryset.get(pk=pk)
    except (model.DoesNotExist, ValueError, TypeError):
        raise Http404('Not found.')
    if action != 'view':
        # Visible but not allowed: 403, from the same check.
        scoped_queryset(user, model, action)
    return obj


def readable_fields(user, model):
    """Field names `user` may read on `model` (empty if they can't see it)."""
    return set(field_access(user, model, _schema_field_names(model)))


def writable_fields(user, model, action):
    """
    Field names `user` may send in a write. `action` is `add` (create) or
    `change` (update): a user with neither gets an empty set.
    """
    if not can(user, model, action):
        return set()
    return {
        name
        for name, access in field_access(user, model, _schema_field_names(model)).items()
        if access == WRITE
    }


__all__ = ['READ', 'WRITE', 'get_record', 'readable_fields', 'scoped_queryset', 'writable_fields']
