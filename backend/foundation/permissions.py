"""
Who may do what, decided in one place and always for an explicit user.

Every function here takes the user as an argument and never reads a request.
That is what lets "View as role" (S-6) ask the same question for someone who
isn't the person signed in, and what lets the schema a user receives be the
very same check the API enforces.

The rules, deny by default:

- **Models.** Django's own model permissions, granted through Groups:
  `<app>.view_<model>`, `add_`, `change_`, `delete_`. No grant, no access.
- **Fields.** A field follows its model's grant unless the model's Schema
  lists it in `restricted_fields`. A restricted field needs its own grant on
  top, one of three levels:
    - `<app>.view_<model>_<field>`: read it;
    - `<app>.add_<model>_<field>`: set it when creating a record, read-only
      afterwards (write-once: a tax ID, a bill number, a bill-of-lading
      number). Mirrors Django's own `add_` model permission;
    - `<app>.change_<model>_<field>`: write it at any time.
  Those permissions are created automatically for every restricted field
  (see `ensure_field_permissions`), so a module declares a sensitive field
  once, by name, and never repeats a codename.
- **Relations.** A many_to_one's value (the linked id) is part of the record
  and readable with it. Its *label* is shown only if the user can see the
  linked record (data.access.visible_related_ids); otherwise it comes back
  restricted. *Changing* the link needs view on the target model, and the
  new id must resolve through the target's scope.
- **Server-owned fields** (`editable=False`) and the primary key are never
  writable by anyone.
- An inactive user can do nothing; a superuser can do everything.

Record rules ("this officer sees only his towns") and tenancy are not here:
they narrow *which rows*, so they live in `data.access.scoped_queryset`.
"""
from django.db import models as djm

ACTIONS = ('view', 'add', 'change', 'delete')
READ = 'read'
WRITE = 'write'
# Writable when creating a record, read-only on every record that exists.
CREATE_ONLY = 'create_only'

# The field-level grants a restricted field gets, as (codename action, verb).
FIELD_GRANTS = (('view', 'view'), ('add', 'set on new'), ('change', 'change'))


def model_permission(model, action):
    """`core.view_contact` for (Contact, 'view')."""
    meta = model._meta
    return f'{meta.app_label}.{action}_{meta.model_name}'


def field_permission_codename(model, field_name, action):
    """`view_contact_tax_id`: the codename (no app label) of a field-level grant."""
    return f'{action}_{model._meta.model_name}_{field_name}'


def can(user, model, action):
    """May `user` perform `action` on `model` at all?"""
    if action not in ACTIONS:
        raise ValueError(f'Unknown action {action!r}')
    if user is None or not user.is_active:
        return False
    return user.has_perm(model_permission(model, action))


def restricted_fields(model):
    """The field names the model's Schema marks as needing their own grant."""
    schema = getattr(model, 'Schema', None)
    return tuple(getattr(schema, 'restricted_fields', ()) or ())


def _has_field_grant(user, model, field_name, action):
    codename = field_permission_codename(model, field_name, action)
    return user.has_perm(f'{model._meta.app_label}.{codename}')


def field_access(user, model, field_names):
    """
    For each of `field_names` the user may see, READ, CREATE_ONLY or WRITE. A
    name missing from the result is hidden from this user: not readable, not
    writable, not filterable, not sortable, not searchable.

    WRITE means "may write it on a record they may create or change";
    CREATE_ONLY means "may set it on a record they're creating, never change
    it after". Whether the user may create or change records at all is the
    model-level `add`/`change` grant, which the caller checks for the action
    at hand.
    """
    if not can(user, model, 'view'):
        return {}

    restricted = set(restricted_fields(model))
    may_change_model = can(user, model, 'change') or can(user, model, 'add')
    meta = model._meta
    access = {}
    for name in field_names:
        field = meta.get_field(name)

        if name in restricted and not _has_field_grant(user, model, name, 'view'):
            continue
        links_to_unviewable = isinstance(field, (djm.ForeignKey, djm.ManyToManyField)) and not can(
            user, field.related_model, 'view'
        )

        could_write = may_change_model and not links_to_unviewable and field.editable and not field.primary_key
        if could_write and (name not in restricted or _has_field_grant(user, model, name, 'change')):
            access[name] = WRITE
        elif could_write and name in restricted and _has_field_grant(user, model, name, 'add'):
            access[name] = CREATE_ONLY
        else:
            access[name] = READ
    return access


def ensure_field_permissions(models):
    """
    Create the three permission rows for every restricted field of `models`.
    Idempotent; run after migrate (see foundation.signals) and in tests.
    Rows for fields no longer restricted are left alone (Django's own
    behaviour for model permissions too): removing a grant is a decision.
    """
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    for model in models:
        names = restricted_fields(model)
        if not names:
            continue
        content_type = ContentType.objects.get_for_model(model)
        for name in names:
            label = model._meta.get_field(name).verbose_name
            for action, verb in FIELD_GRANTS:
                Permission.objects.get_or_create(
                    content_type=content_type,
                    codename=field_permission_codename(model, name, action),
                    defaults={'name': f'Can {verb} {model._meta.verbose_name} {label}'},
                )


def roles_that_can_change(model, field_name):
    """
    The names of the groups holding the full write grant on a restricted
    field, for telling someone who to ask ("Ask a Manager to change it").
    """
    from django.contrib.auth.models import Group

    codename = field_permission_codename(model, field_name, 'change')
    return list(
        Group.objects.filter(
            permissions__content_type__app_label=model._meta.app_label, permissions__codename=codename
        )
        .order_by('name')
        .values_list('name', flat=True)
    )
