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
- **`not_by`** names a user field the actor must not be: whoever requested a
  reduction can't approve it, whatever their role.
- **`records_actor`** names a user field set to whoever ran the transition, so
  `not_by` has something to compare against.
- **`locked`** states refuse edits: a posted document is reversed, never
  changed.
"""
from django.core.exceptions import ImproperlyConfigured


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
                meta.get_field(spec[key])  # raises FieldDoesNotExist on a typo
    unknown = [s for s in decl.get('locked', ()) if s not in states]
    if unknown:
        raise ImproperlyConfigured(f'{model.__name__}.Schema.workflow locks unknown state(s) {unknown}.')


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


def blocked_reason(user, obj, name):
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
    not_by = spec.get('not_by')
    if not_by and getattr(obj, model._meta.get_field(not_by).attname) == user.pk:
        field_label = model._meta.get_field(not_by).verbose_name
        return f'You are this {model._meta.verbose_name}’s {field_label}, so someone else has to do this.'
    return None


def granted(user, model):
    """The transitions `user` holds a grant for, in declaration order."""
    decl = declaration(model)
    if not decl:
        return []
    return [name for name in decl['transitions'] if may_run(user, model, name)]


def available(user, obj):
    """The transitions `user` may run on `obj` now: granted, from this state, not barred by not_by."""
    return [name for name in granted(user, type(obj)) if blocked_reason(user, obj, name) is None]


def schema_for(user, model):
    """
    What the schema says about the workflow for this user: the states (for
    the badge), and only the transitions they hold a grant for. A transition
    they lack is not in it at all.
    """
    decl = declaration(model)
    if not decl:
        return None
    field = model._meta.get_field(decl['field'])
    return {
        'field': decl['field'],
        'states': [{'value': value, 'label': str(label)} for value, label in field.choices],
        'locked': list(decl.get('locked', ())),
        'transitions': [
            {
                'name': name,
                'label': spec['label'],
                'from': list(spec['from']),
                'to': spec['to'],
                **({'confirm': spec['confirm']} if spec.get('confirm') else {}),
            }
            for name, spec in decl['transitions'].items()
            if may_run(user, model, name)
        ],
    }


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
