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

from django.contrib.auth import get_user_model

from foundation import computed, rules
from foundation.permissions import CREATE_ONLY, READ, WRITE, can, field_access


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
    # Tenancy (S-6+) narrows here, then the model's record rules.
    queryset = rules.narrow(user, model, queryset)

    # Computed fields ride on every scoped queryset, so they sort, filter and
    # sum in the database like stored columns.
    return computed.annotate(queryset, model)


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
    """
    Field names `user` may read on `model` (empty if they can't see it),
    computed fields included when every field they're made from is readable.
    """
    from schema.engine import readable_computed

    readable = set(field_access(user, model, _schema_field_names(model)))
    return readable | set(readable_computed(model, readable, user))


def visible_related_ids(user, model, schema, records):
    """
    For each many_to_one in the user's schema, which of the linked ids in
    `records` the user may see, asked through the target's own scope (one
    query per relation, not per row). A label is shown only for these; any
    other link keeps its id and comes back restricted.
    """
    visible = {}
    meta = model._meta
    for name, entry in schema['fields'].items():
        if entry['type'] != 'many_to_one' or 'computed' in entry:
            continue
        field = meta.get_field(name)
        ids = {getattr(record, field.attname) for record in records} - {None}
        target = field.related_model
        if target is get_user_model():
            # A person is named wherever they act: who requested, who approved.
            visible[name] = ids
            continue
        if not ids or not can(user, target, 'view'):
            visible[name] = set()
            continue
        visible[name] = set(scoped_queryset(user, target, 'view').filter(pk__in=ids).values_list('pk', flat=True))
    return visible


def visible_labels(user, model, name, ids):
    """
    {id: label} for the records a many_to_one `name` links to, only those
    `user` may see, asked through the target's own scope. A group header
    names a linked record only if its reader could open it.
    """
    from schema.engine import display_label

    target = model._meta.get_field(name).related_model
    if target is get_user_model():
        return {obj.pk: display_label(obj) for obj in target._default_manager.filter(pk__in=ids)}
    if not ids or not can(user, target, 'view'):
        return {}
    return {obj.pk: display_label(obj) for obj in scoped_queryset(user, target, 'view').filter(pk__in=ids)}


def writable_fields(user, model, action):
    """
    Field names `user` may send in a write. `action` is `add` (create) or
    `change` (update): a user with neither gets an empty set.

    A write-once field (CREATE_ONLY) is writable on `add` and not on `change`,
    so an update that names it is refused by name like any other read-only
    field.
    """
    if not can(user, model, action):
        return set()
    allowed = {WRITE, CREATE_ONLY} if action == 'add' else {WRITE}
    return {
        name
        for name, access in field_access(user, model, _schema_field_names(model)).items()
        if access in allowed
    }


__all__ = [
    'READ',
    'WRITE',
    'get_record',
    'readable_fields',
    'scoped_queryset',
    'visible_labels',
    'visible_related_ids',
    'writable_fields',
]
