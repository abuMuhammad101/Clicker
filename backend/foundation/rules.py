"""
Record rules: which *rows* a role sees, declared on the model's Schema.

    class Schema:
        record_rules = [
            {'role': 'Recovery officer', 'filter': {'owner__user_id': USER}},
        ]

A role named in a rule sees only the records the rule's filter selects
(`USER` stands for the person asking). Anyone who holds a role that can view
the model and is not named in a rule (a Manager, an Auditor) sees every
record. Someone who holds several roles, one of them unbound, sees
everything that unbound role would: rules only ever narrow a role that has
no wider grant of its own.

The narrowing happens in one place, `data.access.scoped_queryset`, so a list,
a record, a picker, a search, a group total, a summary and a related list can
none of them show a row the rule hides, and a hidden record is a 404 like any
other record the user can't see.
"""
from django.contrib.auth.models import Group
from django.db.models import Q

from .permissions import model_permission

# In a rule's filter, a value that means "the user asking".
USER = '@user'


def declared(model):
    return list(getattr(getattr(model, 'Schema', None), 'record_rules', []) or [])


def _groups_that_view(user, model):
    """The names of this user's groups that grant them `view` on the model."""
    app_label, codename = model_permission(model, 'view').split('.', 1)
    return set(
        Group.objects.filter(
            user=user, permissions__content_type__app_label=app_label, permissions__codename=codename
        ).values_list('name', flat=True)
    )


def _resolve(filters, user):
    return {key: (user.pk if value == USER else value) for key, value in filters.items()}


def is_narrowed(user, model):
    """Does a record rule limit which rows of `model` this user sees?"""
    rules = declared(model)
    if not rules or user.is_superuser:
        return False
    viewing = _groups_that_view(user, model)
    return bool(viewing) and viewing <= {rule['role'] for rule in rules}


def narrow(user, model, queryset):
    """`queryset` limited to the rows this user's record rules allow."""
    rules = declared(model)
    if not rules or user.is_superuser:
        return queryset
    viewing = _groups_that_view(user, model)
    bound = {rule['role'] for rule in rules}
    if not viewing or not viewing <= bound:
        return queryset  # no role of theirs is bound, or one has the wider view
    condition = Q()
    for rule in rules:
        if rule['role'] in viewing:
            condition |= Q(pk__in=model._default_manager.filter(**_resolve(rule['filter'], user)).values('pk'))
    return queryset.filter(condition)
