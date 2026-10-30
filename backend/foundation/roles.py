"""
The built-in roles, as Django Groups.

- **Manager**: every permission on every exposed model, field grants included.
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
CLERK = 'Clerk'
BUILT_IN_ROLES = (MANAGER, CLERK)


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

    manager, _ = Group.objects.using(using).get_or_create(name=MANAGER)
    manager.permissions.set(
        Permission.objects.using(using).filter(content_type__in=content_types.values())
    )

    grants = {role: [] for role in BUILT_IN_ROLES if role != MANAGER}
    for model in models:
        for role, codenames in declared_grants(model).items():
            if role == MANAGER:
                continue  # Managers have everything; declaring it would be noise.
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
