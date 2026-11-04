"""
Workflow states, declared on a model's Schema and enforced by the data layer.

A module states its workflow once, beside its fields:

    class Schema:
        workflow = {
            'field': 'state',             # a CharField with choices, editable=False
            'locked': ['posted', ...],    # states in which the record can't be edited
            'transitions': {
                'post':    {'label': 'Post', 'from': ['draft'], 'to': 'posted'},
                'cancel':  {'label': 'Cancel', 'from': ['draft'], 'to': 'cancelled',
                            'confirm': 'Cancel this invoice? It can’t be posted again.'},
                'request': {'label': 'Request approval', 'from': ['draft'], 'to': 'requested',
                            'records_actor': 'requested_by'},
                'approve': {'label': 'Approve', 'from': ['requested'], 'to': 'approved',
                            'not_by': 'requested_by'},
            },
        }

Rules that follow from it, with no per-model code:

- **The state is server-owned.** The field is `editable=False`, so no create or
  update can set it; only running a transition moves it.
- **Each transition is its own grant**, `<app>.<transition>_<model>` ("Can
  post invoice"), created automatically after migrate and given to roles in
  `default_grants` like any other permission. A transition the user lacks is
  absent from their schema and refused by the API.
- **`from`** lists the states a transition may start from; anything else is a
  conflict (409), not a permission problem.
- **`not_by`** names a user field (or a list of them) the actor must not be:
  whoever requested a reduction can't approve it, whatever their role; a
  second approver is neither the requester nor the first approver.
- **`records_actor`** names a user field set to whoever ran the transition, so
  `not_by` has something to compare against.
- **`locked`** states refuse edits: a posted document is reversed, never
  changed.

Behaviour a model supplies as methods, named in the transition (all optional):

- **`run`**: a method `run(self, ctx)` called inside the transition's
  transaction, after the state has moved and before it is audited. Its side
  effects (allocating a payment, generating a run's bills, reducing a bill)
  commit with the transition or not at all; raise `actions.Refused('why')`
  to undo it all with a sentence. It writes other records with
  `foundation.actions`, so every effect is audited under the actor.
- **`check`**: a method `check(self, user)` returning a sentence when the
  transition can't be done now ("Cancelling needs nothing allocated"), or
  None. The button stays; clicking it explains.
- **`when`**: a method returning whether this transition applies to the
  record at all, for two transitions that share a verb ("Approve" by one
  person, or by two above a threshold). One that doesn't apply is simply not
  offered; `unavailable` is the sentence if someone asks for it anyway.

And for how it reads on screen, all optional:

- **`path`**: the main line of states, in order, which the record header draws
  as a stepper (Draft → Requested → Approved). States off it (Cancelled,
  Rejected) are exits. Default: every state, in the field's choice order.
- **`tones`**: `{state: 'positive' | 'warning' | 'danger' | 'critical' | 'info' | 'neutral'}` (`critical` is danger, solid: money is being lost now),
  the colour of the state's chip. Default neutral.
- **`hint`** on a transition: what it does, in words, shown beside its button
  before anyone presses it ("Once posted, it can't be edited, only reversed.").
  A transition that hands the record to an approver (it `records_actor`s a
  field another transition is `not_by`) gets its hint written for it: "This
  goes to a Manager for approval."
"""
from django.core.exceptions import ImproperlyConfigured

TONES = ('positive', 'warning', 'danger', 'critical', 'info', 'neutral')


def declaration(model):
    """The model's workflow declaration, checked, or None."""
    schema = getattr(model, 'Schema', None)
    decl = getattr(schema, 'workflow', None)
    if not decl:
        return None
    _check(model, decl)
    return decl


def _check(model, decl):
    meta = model._meta
    field = meta.get_field(decl['field'])
    if field.editable:
        raise ImproperlyConfigured(
            f'{model.__name__}.{field.name} holds workflow state, so it must be editable=False: '
            'only transitions may move it.'
        )
    states = {value for value, _ in field.choices or ()}
    for name, spec in decl['transitions'].items():
        unknown = [s for s in [*spec['from'], spec['to']] if s not in states]
        if unknown:
            raise ImproperlyConfigured(f'{model.__name__} transition "{name}" names unknown state(s) {unknown}.')
        for key in ('not_by', 'records_actor'):
            if key in spec:
                for field_name in ([spec[key]] if isinstance(spec[key], str) else spec[key]):
                    meta.get_field(field_name)  # raises FieldDoesNotExist on a typo
        for key in ('run', 'check', 'when'):
            if spec.get(key) and not callable(getattr(model, spec[key], None)):
                raise ImproperlyConfigured(
                    f'{model.__name__} transition "{name}" names {key}="{spec[key]}", which is not a method.'
                )
    unknown = [s for s in decl.get('locked', ()) if s not in states]
    if unknown:
        raise ImproperlyConfigured(f'{model.__name__}.Schema.workflow locks unknown state(s) {unknown}.')
    unknown = [s for s in [*decl.get('path', ()), *decl.get('tones', {})] if s not in states]
    if unknown:
        raise ImproperlyConfigured(f'{model.__name__}.Schema.workflow path or tones name unknown state(s) {unknown}.')
    bad = {s: t for s, t in decl.get('tones', {}).items() if t not in TONES}
    if bad:
        raise ImproperlyConfigured(f'{model.__name__}.Schema.workflow tones must be one of {TONES}, not {bad}.')


def transition_codename(model, name):
    """`post_invoice`: the codename (no app label) of a transition's grant."""
    return f'{name}_{model._meta.model_name}'


def may_run(user, model, name):
    """Does `user` hold the grant for this transition at all?"""
    if user is None or not user.is_active:
        return False
    return user.has_perm(f'{model._meta.app_label}.{transition_codename(model, name)}')


def state_of(obj):
    decl = declaration(type(obj))
    return getattr(obj, decl['field'])


def state_label(model, value):
    decl = declaration(model)
    return str(dict(model._meta.get_field(decl['field']).choices).get(value, value))


def is_locked(obj):
    """Is this record in a state that refuses edits?"""
    decl = declaration(type(obj))
    return bool(decl) and state_of(obj) in decl.get('locked', ())


def blocked_reason(user, obj, name, check=True):
    """
    Why `user` can't run transition `name` on `obj` right now, or None if
    they can. The grant is checked separately (see `may_run`): this answers
    "not from this state" and "not by you".
    """
    model = type(obj)
    spec = declaration(model)['transitions'][name]
    state = state_of(obj)
    if state not in spec['from']:
        return f'“{spec["label"]}” isn’t possible: this {model._meta.verbose_name} is {state_label(model, state)}.'
    if not applies(obj, spec):
        return spec.get('unavailable') or f'“{spec["label"]}” doesn’t apply to this {model._meta.verbose_name}.'
    barred = barred_reason(user, obj, spec)
    if barred:
        return barred
    if check and spec.get('check'):
        return getattr(obj, spec['check'])(user)
    return None


def barred_reason(user, obj, spec):
    """Why this user is barred from the transition by `not_by` (they made the request), or None."""
    model = type(obj)
    for not_by in not_by_fields(spec):
        if getattr(obj, model._meta.get_field(not_by).attname) == user.pk:
            field_label = model._meta.get_field(not_by).verbose_name
            return f'You are this {model._meta.verbose_name}’s {field_label}, so someone else has to do this.'
    return None


def not_by_fields(spec):
    """The user fields a transition bars, always as a list."""
    value = spec.get('not_by')
    return [] if not value else [value] if isinstance(value, str) else list(value)


def applies(obj, spec):
    """Does this transition apply to this record at all (its `when`, if it has one)?"""
    return not spec.get('when') or bool(getattr(obj, spec['when'])())


def granted(user, model):
    """The transitions `user` holds a grant for, in declaration order."""
    decl = declaration(model)
    if not decl:
        return []
    return [name for name in decl['transitions'] if may_run(user, model, name)]


def available(user, obj, checks=False):
    """
    The transitions `user` may run on `obj` now: granted, from this state, not barred by not_by.
    With `checks`, a transition whose own `check` would refuse right now is left out too: one
    record's form can afford to run them (a bill with payments offers no Cancel); a list of
    records can't (that would be a query or two per row), so it leaves them to the click.
    """
    return [name for name in granted(user, type(obj)) if blocked_reason(user, obj, name, check=checks) is None]


def roles_that_may_run(model, name):
    """The groups holding a transition's grant, for "Waiting for a Manager…"."""
    from django.contrib.auth.models import Group

    return list(
        Group.objects.filter(
            permissions__content_type__app_label=model._meta.app_label,
            permissions__codename=transition_codename(model, name),
        )
        .order_by('name')
        .values_list('name', flat=True)
    )


def _a(roles):
    """'a Manager', 'an Accountant or Manager'."""
    if not roles:
        return 'someone with access'
    article = 'an' if roles[0][:1].lower() in 'aeiou' else 'a'
    return f'{article} {" or ".join(roles)}'


def _either(labels):
    """['Approve', 'Reject'] → 'approve or reject'."""
    labels = [label.lower() for label in labels]
    return labels[0] if len(labels) == 1 else f'{", ".join(labels[:-1])} or {labels[-1]}'


def _hint(model, decl, spec):
    if spec.get('hint'):
        return spec['hint']
    actor = spec.get('records_actor')
    if not actor:
        return None
    # It hands the record to whoever may run the transitions its actor is barred from.
    approvals = [n for n, s in decl['transitions'].items() if actor in not_by_fields(s)]
    if not approvals:
        return None
    roles = sorted({role for n in approvals for role in roles_that_may_run(model, n)})
    return f'This goes to {_a(roles)} for approval.'


def schema_for(user, model):
    """
    What the schema says about the workflow for this user: the states (for
    the stepper and chips), and only the transitions they hold a grant for.
    A transition they lack is not in it at all.
    """
    decl = declaration(model)
    if not decl:
        return None
    field = model._meta.get_field(decl['field'])
    tones = decl.get('tones', {})
    transitions = []
    for name, spec in decl['transitions'].items():
        if not may_run(user, model, name):
            continue
        entry = {'name': name, 'label': spec['label'], 'from': list(spec['from']), 'to': spec['to']}
        if spec.get('confirm') or spec.get('confirm_with'):
            # `confirm_with` names a method that words the question for one record
            # ("This creates a draft invoice for Rs 12,48,500…"); the record carries that
            # sentence, and this is only the fallback.
            entry['confirm'] = spec.get('confirm') or 'Go ahead?'
        hint = _hint(model, decl, spec)
        if hint:
            entry['hint'] = hint
        transitions.append(entry)
    path = list(decl.get('path') or [value for value, _ in field.choices])
    states = []
    for value, label in field.choices:
        state = {'value': value, 'label': str(label), 'tone': tones.get(value, 'neutral')}
        if value not in path:
            # An exit (Cancelled, Rejected): the step it leaves the path from,
            # so the stepper can place it whichever transitions this user holds.
            state['after'] = next(
                (s for spec in decl['transitions'].values() if spec['to'] == value for s in spec['from'] if s in path),
                None,
            )
        states.append(state)
    return {
        'field': decl['field'],
        'states': states,
        'path': path,
        'locked': list(decl.get('locked', ())),
        'transitions': transitions,
    }


def record_status(user, obj, roles_cache=None, checks=False):
    """
    What a record's header needs to say about its workflow for this user:

    - `available`: the transitions they may run on it now;
    - `locked` and `locked_reason`: whether its state refuses edits, and why;
    - `waiting`: when they can do nothing, who can and what ("Waiting for a
      Manager to approve or reject it."). Never a disabled button with no
      explanation: if a step is someone else's, the sentence says whose.

    `roles_cache` (a dict) lets a list of records share one lookup of who
    holds each transition, instead of one query per record. `checks` (one
    record, not a list) also drops transitions whose own check refuses now.
    """
    model = type(obj)
    decl = declaration(model)
    meta = model._meta
    state = state_of(obj)
    available_now = available(user, obj, checks)
    locked = state in decl.get('locked', ())
    status = {
        'available': available_now,
        'locked': locked,
        'locked_reason': (
            f'This {meta.verbose_name} is {state_label(model, state)}, so it can’t be edited.' if locked else None
        ),
        'waiting': None,
        # Transitions this user holds that are in the right state but whose own check refuses
        # now, as sentences ("Payments have been applied, so it can’t be cancelled"). One
        # record only; empty for a list.
        'held_back': _held_back(user, obj) if checks else [],
        'confirms': _confirms(user, obj) if checks else {},
    }
    if available_now:
        return status
    pending = [(n, s) for n, s in decl['transitions'].items() if state in s['from'] and applies(obj, s)]
    if checks:
        # Held back by its own check (the reason is on the click), not waiting on someone else.
        pending = [(n, s) for n, s in pending if blocked_reason(user, obj, n, check=False) is not None or n not in granted(user, model)]
    if not pending:
        return status
    actions = _either(list(dict.fromkeys(s['label'] for _, s in pending)))
    cache = roles_cache if roles_cache is not None else {}
    for n, _ in pending:
        if (model, n) not in cache:
            cache[(model, n)] = roles_that_may_run(model, n)
    roles = sorted({role for n, _ in pending for role in cache[(model, n)]})
    barred = next(
        (field for n, s in pending if may_run(user, model, n)
         for field in not_by_fields(s) if getattr(obj, meta.get_field(field).attname) == user.pk),
        None,
    )
    if barred:
        others = f'another {" or ".join(roles)}' if roles else 'someone else'
        status['waiting'] = f'You’re its {meta.get_field(barred).verbose_name}, so {others} has to {actions} it.'
    else:
        status['waiting'] = f'Waiting for {_a(roles)} to {actions} it.'
    return status


def _confirms(user, obj):
    """{transition: sentence} for the available transitions whose question depends on the record."""
    decl = declaration(type(obj))
    return {
        name: getattr(obj, spec['confirm_with'])(user)
        for name, spec in decl['transitions'].items()
        if spec.get('confirm_with') and blocked_reason(user, obj, name, check=False) is None
    }


def _held_back(user, obj):
    model = type(obj)
    reasons = []
    for name in granted(user, model):
        if blocked_reason(user, obj, name, check=False) is None:
            reason = blocked_reason(user, obj, name, check=True)
            if reason:
                reasons.append(reason)
    return reasons


def ensure_transition_permissions(models):
    """One permission per declared transition. Idempotent; run after migrate."""
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    for model in models:
        decl = declaration(model)
        if not decl:
            continue
        content_type = ContentType.objects.get_for_model(model)
        for name, spec in decl['transitions'].items():
            Permission.objects.get_or_create(
                content_type=content_type,
                codename=transition_codename(model, name),
                defaults={'name': f'Can {spec["label"].lower()} {model._meta.verbose_name}'},
            )
