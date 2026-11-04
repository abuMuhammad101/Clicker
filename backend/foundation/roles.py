"""
The built-in roles, as Django Groups.

- **Manager** and **Owner**: every permission on every exposed model, field grants
  included. Two names for the same power, because each journey calls its
  top role what its people call it (a water board has a Manager, a clearing
  agency an Owner).
- **Auditor**: every `view_` permission on every exposed model, field-level
  reads included, and nothing else: it reads everything, activity trail and
  all, and changes nothing.
- **Clerk** (and any later role): exactly what each model's Schema grants it in
  `default_grants`, e.g. `{'Clerk': ['view_contact', 'change_contact']}`.
  A model that grants a role nothing is invisible to it.

Roles are declared beside the models they're about, so a new module brings
its own grants and this file never names a model.

These two groups are owned by code: `seed_roles()` sets their permissions to
exactly this after every migrate, so a hand edit to them in admin won't
last. Other groups are left alone. (S-6's team and roles page will decide
whether roles become editable data.)
"""
from django.apps import apps

MANAGER = 'Manager'
OWNER = 'Owner'
CLERK = 'Clerk'
AUDITOR = 'Auditor'
BUILT_IN_ROLES = (MANAGER, OWNER, CLERK, AUDITOR)
# The roles that hold every permission: whoever may do anything, the last of them can't be removed.
TOP_ROLES = (MANAGER, OWNER)


def journey():
    """The running journey's settings, or None when every app is exposed (tests, development)."""
    from django.conf import settings

    return settings.CLICKER_JOURNEYS.get(settings.CLICKER_JOURNEY)


def top_roles():
    """The roles that hold every permission here: both names with no journey, else the journey's own."""
    running = journey()
    return (running['top_role'],) if running else TOP_ROLES


def active_roles():
    """The roles that exist in this deployment: the journey's five, or None for all of them."""
    running = journey()
    return set(running['roles']) if running else None


def _exposed_models():
    from schema.engine import is_exposed

    return [model for model in apps.get_models() if is_exposed(model)]


def declared_grants(model):
    """{role: [codename, ...]} from the model's Schema."""
    schema = getattr(model, 'Schema', None)
    return dict(getattr(schema, 'default_grants', {}) or {})


def seed_roles(using='default'):
    from django.contrib.auth.models import Group, Permission
    from django.contrib.contenttypes.models import ContentType

    models = _exposed_models()
    content_types = ContentType.objects.db_manager(using).get_for_models(*models)

    allowed = active_roles()
    for top in top_roles():
        group, _ = Group.objects.using(using).get_or_create(name=top)
        group.permissions.set(Permission.objects.using(using).filter(content_type__in=content_types.values()))

    if allowed is None or AUDITOR in allowed:
        auditor, _ = Group.objects.using(using).get_or_create(name=AUDITOR)
        auditor.permissions.set(
            Permission.objects.using(using).filter(
                content_type__in=content_types.values(), codename__startswith='view_'
            )
        )

    grants = {role: [] for role in BUILT_IN_ROLES if role not in (*TOP_ROLES, AUDITOR) and (allowed is None or role in allowed)}
    for model in models:
        for role, codenames in declared_grants(model).items():
            if role in (*TOP_ROLES, AUDITOR):
                continue  # The top roles have everything and Auditors read everything; declaring it would be noise.
            if allowed is not None and role not in allowed:
                continue  # Another journey's role: not created here.
            content_type = content_types[model]
            for codename in codenames:
                try:
                    permission = Permission.objects.using(using).get(content_type=content_type, codename=codename)
                except Permission.DoesNotExist:
                    raise ValueError(
                        f'{model.__name__}.Schema.default_grants gives {role} "{codename}", '
                        'which is not a permission on that model.'
                    )
                grants.setdefault(role, []).append(permission)

    for role, permissions in grants.items():
        group, _ = Group.objects.using(using).get_or_create(name=role)
        group.permissions.set(permissions)
