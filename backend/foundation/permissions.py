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
  top: `<app>.view_<model>_<field>` to read it and `<app>.change_<model>_<field>`
  to write it. Those permissions are created automatically for every
  restricted field (see `ensure_field_permissions`), so a module declares a
  sensitive field once, by name, and never repeats a codename.
- **Relations.** A many_to_one field is readable only if its target model is:
  a contact's country is hidden from someone who can't see countries.
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
    For each of `field_names` the user may see, READ or WRITE. A name missing
    from the result is hidden from this user: not readable, not writable, not
    filterable, not sortable, not searchable.

    WRITE here means "may change it on a record they may change"; whether the
    user may change records at all is the model-level `change`/`add` grant,
    which the caller checks for the action at hand.
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
        if isinstance(field, (djm.ForeignKey, djm.ManyToManyField)) and not can(
            user, field.related_model, 'view'
        ):
            continue

        writable = (
            may_change_model
            and field.editable
            and not field.primary_key
            and (name not in restricted or _has_field_grant(user, model, name, 'change'))
        )
        access[name] = WRITE if writable else READ
    return access


def ensure_field_permissions(models):
    """
    Create the two permission rows for every restricted field of `models`.
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
            for action, verb in (('view', 'view'), ('change', 'change')):
                Permission.objects.get_or_create(
                    content_type=content_type,
                    codename=field_permission_codename(model, name, action),
                    defaults={'name': f'Can {verb} {model._meta.verbose_name} {label}'},
                )
