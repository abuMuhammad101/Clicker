"""
Writing records from code the way the API writes them: for a transition's
side effects, an automation, a seed. Same rules, same trail.

    ctx = Context(user)                       # who is acting; None ip for code
    bill = actions.create(ctx, Bill, customer=acme, issue_date=today)
    actions.change(ctx, bill, summary='…', amount_paid=Decimal('1000'))
    actions.perform_transition(ctx, bill, 'post')

Everything here writes the audit entry in the same transaction as the change,
stamps `created_by` / `updated_by`, assigns document numbers, validates with
`full_clean()` and runs the model's `on_save` hook, exactly as a request to
the generic API does. A write that a rule refuses raises `Refused` (HTTP 409
inside a request), and because every write is atomic, a refusal inside a
bigger operation undoes all of it.

The acting user is whoever the work is for. A scheduled job acts as the
system user (`system_user()`), whose name reads "Clicker automation" in every
trail: never a person's, never blank.
"""
from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework.exceptions import APIException

from . import numbering, workflow
from .audit import record_change, snapshot
from .models import AuditEntry, ClickerModel

SYSTEM_USERNAME = 'clicker-automation'


class Refused(APIException):
    """A rule says no, with a sentence a person can act on. 409 inside a request."""

    status_code = 409
    default_detail = 'This can’t be done right now.'
    default_code = 'refused'


@dataclass(frozen=True)
class Context:
    """Who is acting, and from where."""

    user: object
    ip_address: str | None = None


def system_user():
    """
    The user that scheduled work acts as. Can't sign in (no usable password);
    holds the Manager role so the same permission and scope code answers for
    it as for anyone. Created on first use.
    """
    from django.contrib.auth.models import Group

    user_model = get_user_model()
    user, created = user_model.objects.get_or_create(
        **{user_model.USERNAME_FIELD: SYSTEM_USERNAME},
        defaults={'first_name': 'Clicker', 'last_name': 'automation', 'is_active': True},
    )
    if created or user.has_usable_password():
        user.set_unusable_password()
        user.save(update_fields=['password'])
    manager = Group.objects.filter(name='Manager').first()
    if manager and not user.groups.filter(pk=manager.pk).exists():
        user.groups.add(manager)
    return user


def system_context():
    return Context(system_user())


def audited_fields(model):
    """What the audit log records for a model: every field a schema can show (minus the pk)."""
    from schema.engine import schema_field_names

    pk = model._meta.pk.name
    return [name for name in schema_field_names(model) if name != pk]


def _sentence(error):
    messages = []
    if hasattr(error, 'message_dict'):
        for problems in error.message_dict.values():
            messages.extend(problems)
    else:
        messages.extend(error.messages)
    return ' '.join(messages)


def _server_owned(ctx, model, creating):
    if not issubclass(model, ClickerModel):
        return {}
    values = {'updated_by': ctx.user}
    if creating:
        values['created_by'] = ctx.user
    return values


def after_save(obj, ctx, created):
    """The model's `Schema.on_save` hook, if it declares one: runs inside the write's transaction."""
    name = getattr(getattr(type(obj), 'Schema', None), 'on_save', None)
    if name:
        getattr(obj, name)(ctx, created)


def create(ctx, model, *, summary='', **values):
    """Create one record, validated, numbered, saved and audited. Returns it."""
    fields = audited_fields(model)
    with transaction.atomic():
        obj = model(**values, **_server_owned(ctx, model, creating=True), **numbering.assigned_values(model))
        try:
            obj.full_clean()
        except DjangoValidationError as error:
            raise Refused(_sentence(error))
        obj.save()
        after_save(obj, ctx, created=True)
        obj.refresh_from_db()
        record_change(
            actor=ctx.user,
            ip_address=ctx.ip_address,
            obj=obj,
            action=AuditEntry.ACTION_CREATE,
            before=None,
            after=snapshot(obj, fields),
            summary=summary,
        )
    return obj


def change(ctx, obj, *, summary='', **values):
    """
    Set fields on an existing record and audit it. For the data layer's own
    fields (a bill's paid amount, an allocation's reversed flag): not for
    user input, which goes through the API's allowlist. The caller holds the
    row lock when the value depends on the old one.
    """
    model = type(obj)
    fields = audited_fields(model)
    with transaction.atomic():
        before = snapshot(obj, fields)
        for name, value in values.items():
            setattr(obj, name, value)
        update = list(values)
        for name, value in _server_owned(ctx, model, creating=False).items():
            setattr(obj, name, value)
            update.append(name)
        if issubclass(model, ClickerModel):
            update.append('updated_at')
        obj.save(update_fields=update)
        record_change(
            actor=ctx.user,
            ip_address=ctx.ip_address,
            obj=obj,
            action=AuditEntry.ACTION_UPDATE,
            before=before,
            after=snapshot(obj, fields),
            summary=summary,
        )
    return obj


def note(ctx, obj, summary):
    """An audit entry with no field changes: something happened to this record worth saying."""
    fields = audited_fields(type(obj))
    state = snapshot(obj, fields)
    record_change(
        actor=ctx.user,
        ip_address=ctx.ip_address,
        obj=obj,
        action=AuditEntry.ACTION_UPDATE,
        before=state,
        after=state,
        summary=summary,
    )


def perform_transition(ctx, obj, name, *, summary=''):
    """
    Move `obj` through workflow transition `name` for `ctx.user`, whole:
    lock the row, check the state and the transition's rules, set the new
    state and its actor stamp, run the transition's `run` hook, and audit,
    all in one transaction. The caller has already decided the user may try
    (the API checks the grant; code that acts for someone calls
    `require_grant` first).
    """
    model = type(obj)
    decl = workflow.declaration(model)
    spec = decl['transitions'][name]
    fields = audited_fields(model)
    with transaction.atomic():
        obj = model._default_manager.select_for_update().get(pk=obj.pk)
        before = snapshot(obj, fields)
        reason = workflow.blocked_reason(ctx.user, obj, name)
        if reason:
            raise Refused(reason)

        setattr(obj, decl['field'], spec['to'])
        changed = [decl['field']]
        if spec.get('records_actor'):
            setattr(obj, spec['records_actor'], ctx.user)
            changed.append(spec['records_actor'])
        if isinstance(obj, ClickerModel):
            obj.updated_by = ctx.user
            changed += ['updated_by', 'updated_at']
        obj.save(update_fields=changed)
        if spec.get('run'):
            getattr(obj, spec['run'])(ctx)
            obj.refresh_from_db()
        record_change(
            actor=ctx.user,
            ip_address=ctx.ip_address,
            obj=obj,
            action=AuditEntry.ACTION_TRANSITION,
            before=before,
            after=snapshot(obj, fields),
            summary=summary,
        )
    return obj


def require_grant(ctx, model, name):
    """Code acting for a person may only do what that person may: Refused if they lack the grant."""
    if not workflow.may_run(ctx.user, model, name):
        raise Refused(
            f'{ctx.user.get_full_name() or ctx.user.get_username()} can’t '
            f'{workflow.declaration(model)["transitions"][name]["label"].lower()} a {model._meta.verbose_name}.'
        )
