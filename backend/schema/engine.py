"""
Turns a Django model into the JSON shape the renderer consumes.

Base field type, required-ness, choices, and FK targets are read straight off
the Django field — a module author never repeats that information. The
handful of things Django has no way to express (phone vs. plain text,
conditional visibility, list-view defaults, an FK's candidate domain) come
from an optional `Schema` inner class on the model. That class is the only
per-module hook this engine has; if a screen needs something the `Schema`
class can't say, that's a gap in this file, not a reason to special-case a
model in the frontend.
"""
import datetime
import decimal
import re

from django.apps import apps

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import validators as djv
from django.core.exceptions import FieldDoesNotExist
from django.db import models as djm

from foundation import computed as computed_fields
from foundation import numbering, workflow
from foundation.permissions import CREATE_ONLY, WRITE, can, field_access, roles_that_can_change


def json_safe(value):
    """
    A schema or record value as JSON can carry it exactly. Decimals become
    strings, never floats: money must survive the trip to the browser to the
    last paisa, and the frontend formats from the string.
    """
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    return value


def _bounds(field):
    """The tightest min and max a field's validators allow (e.g. a PositiveIntegerField's 0)."""
    low = high = None
    for validator in field.validators:
        if isinstance(validator, djv.MinValueValidator):
            limit = validator.limit_value() if callable(validator.limit_value) else validator.limit_value
            low = limit if low is None else max(low, limit)
        elif isinstance(validator, djv.MaxValueValidator):
            limit = validator.limit_value() if callable(validator.limit_value) else validator.limit_value
            high = limit if high is None else min(high, limit)
    return low, high


def _base_type_for_field(field):
    if isinstance(field, djm.EmailField):
        return 'email'
    if isinstance(field, djm.URLField):
        return 'url'
    if isinstance(field, djm.ManyToManyField):
        return 'many_to_many'
    if isinstance(field, djm.ForeignKey):
        return 'many_to_one'
    if isinstance(field, djm.DateTimeField):
        return 'datetime'
    if isinstance(field, djm.DateField):
        return 'date'
    if isinstance(field, djm.BooleanField):
        return 'boolean'
    if isinstance(field, djm.DecimalField):
        return 'decimal'
    if isinstance(field, djm.IntegerField):
        return 'integer'
    if isinstance(field, (djm.FileField, djm.BinaryField)):
        return 'binary'
    if isinstance(field, djm.TextField):
        return 'longtext'
    if field.choices:
        return 'selection'
    return 'text'


def _field_schema(field, overrides):
    name = field.name
    base_type = overrides['field_types'].get(name, _base_type_for_field(field))

    # Sentence case, not title case: "Job title", not "Job Title" — matches
    # the density-focused UI references in CLAUDE.md (Linear, Attio) and
    # means an explicit verbose_name like "tax ID" survives as "Tax ID"
    # instead of Python's str.title() mangling it into "Tax Id".
    verbose_name = field.verbose_name
    label = verbose_name[:1].upper() + verbose_name[1:] if verbose_name else name

    # A checkbox has no "empty" state — it's always true or false — so
    # required-ness isn't meaningful for booleans even when blank=False.
    required = base_type != 'boolean' and not getattr(field, 'blank', True) and name != 'id'

    entry = {
        'type': base_type,
        'label': label,
        'required': required,
        # The primary key is identity, not input; a datetime is display-only
        # for now (audit and system times), never typed by a person.
        'read_only': name == 'id' or base_type == 'datetime',
        'visible_when': overrides['visible_when'].get(name),
    }

    max_length = getattr(field, 'max_length', None)
    if max_length:
        entry['max_length'] = max_length

    if base_type in ('decimal', 'currency'):
        # Precision and scale come from the field, not a frontend guess —
        # a decimal component has no correct default for either.
        entry['max_digits'] = field.max_digits
        entry['decimal_places'] = field.decimal_places
    if base_type == 'currency':
        # One organisation currency for now (multi-currency is parked).
        entry['currency'] = settings.CLICKER_CURRENCY['code']

    if base_type in ('integer', 'decimal', 'currency', 'date'):
        low, high = _bounds(field)
        if low is not None:
            entry['min_value'] = json_safe(low)
        if high is not None:
            entry['max_value'] = json_safe(high)

    help_text = getattr(field, 'help_text', '')
    if help_text:
        entry['help_text'] = str(help_text)

    if field.has_default():
        entry['default'] = json_safe(field.get_default())

    if field.choices:
        entry['choices'] = [{'value': value, 'label': label} for value, label in field.choices]

    if base_type in ('many_to_one', 'many_to_many'):
        related_meta = field.related_model._meta
        entry['target'] = {'app_label': related_meta.app_label, 'model': related_meta.model_name}
        if field.related_model is get_user_model():
            entry['person'] = True
        domain = overrides['domains'].get(name)
        if domain:
            entry['domain'] = domain

    return entry


def display_label(obj):
    """
    The human label for one record: its model's `Schema.display_field` if
    declared, else `str()`. The one definition of "what a record is called",
    shared by the search endpoint, the record endpoint's FK labels, and the
    record envelope's own title.
    """
    if isinstance(obj, get_user_model()):
        # A person is named, never shown by their login.
        return obj.get_full_name() or obj.get_username()
    display_field = getattr(getattr(type(obj), 'Schema', None), 'display_field', None)
    return str(getattr(obj, display_field)) if display_field else str(obj)


def get_exposed_model(app_label, model_name):
    """
    Resolves a URL's app_label/model_name to a model, but only if that model
    opted in by declaring a `Schema` inner class. Without this gate the
    generic endpoints would serve any installed model — auth.User included,
    password hashes and all. Raises LookupError for anything not exposed.
    """
    from django.apps import apps

    model = apps.get_model(app_label, model_name)
    if not is_exposed(model):
        raise LookupError(f'{app_label}.{model_name} does not declare a Schema')
    return model


def is_exposed(model):
    """A model is part of Clicker's UI and API exactly when it declares a Schema."""
    return hasattr(model, 'Schema')


def _sentence_case(text):
    text = str(text)
    return text[:1].upper() + text[1:]


_ICON_NAME = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')


def _icon_name(model):
    """`Schema.icon`, if declared and shaped like a lucide icon name (kebab-case)."""
    icon = getattr(getattr(model, 'Schema', None), 'icon', None)
    return icon if isinstance(icon, str) and _ICON_NAME.match(icon) else None


def build_registry(user):
    """
    What exists: every installed app with at least one exposed model, and
    those models. Derived entirely from Django's app registry — the same
    opt-in rule (a `Schema` class) that exposes a model to the API exposes
    it to navigation. Installing a module makes it appear; there is no
    second, hand-maintained list of what the nav contains.

    Each model carries an optional `icon` (a lucide icon name) from its Schema.

    Apps keep INSTALLED_APPS order. Models within an app are alphabetical
    by label: predictable, and needs no extra metadata. (If a module ever
    needs a deliberate order, that's a `Schema` attribute, added then.)

    Only models `user` may view are listed: navigation is not a way to learn
    that a module exists.
    """
    from django.apps import apps

    registry = []
    for app_config in apps.get_app_configs():
        models = [
            {
                'model': model._meta.model_name,
                'label': _sentence_case(model._meta.verbose_name_plural),
                'label_singular': _sentence_case(model._meta.verbose_name),
                'route': f'/{app_config.label}/{model._meta.model_name}',
                # Optional: a lucide icon name from the model's Schema. Absent
                # means the frontend uses its generic icon — icon design is
                # deferred without blocking a module from appearing.
                'icon': _icon_name(model),
            }
            for model in app_config.get_models()
            if is_exposed(model) and can(user, model, 'view')
        ]
        if not models:
            continue
        models.sort(key=lambda entry: entry['label'].lower())
        registry.append({
            'app_label': app_config.label,
            'label': _sentence_case(app_config.verbose_name),
            'models': models,
        })
    return registry


def _build_groups(schema_cls, field_names):
    """
    Form layout, as data. Two distinct "no explicit group" signals, not one:

    - The model declares no `groups` at all (e.g. Country) → one group with
      `label: None`. The renderer shows the fields with no section heading.
      This is the correct, unremarkable default for a model too small to
      need sections.
    - The model declares `groups` but misses some fields (a module author's
      oversight, not a design choice) → those fields are appended as a
      trailing group literally labelled "Ungrouped", so a missing field is
      visible in the rendered form instead of silently absent from it.
    """
    declared = getattr(schema_cls, 'groups', None)

    if not declared:
        return [{'label': None, 'fields': list(field_names)}]

    groups = []
    seen = set()
    valid_names = set(field_names)

    for group in declared:
        label = group['label']
        group_fields = group['fields']
        unknown = [f for f in group_fields if f not in valid_names]
        if unknown:
            raise ValueError(
                f'Schema.groups for group "{label}" references field(s) '
                f'{unknown} that do not exist on this model.'
            )
        groups.append({'label': label, 'fields': list(group_fields)})
        seen.update(group_fields)

    leftover = [name for name in field_names if name not in seen]
    if leftover:
        groups.append({'label': 'Ungrouped', 'fields': leftover})

    return groups


def schema_field_names(model):
    """
    The fields a schema can expose for `model`, before any user is considered:
    concrete fields and forward relations, minus server-owned ones. Reverse
    relations (auto_created, not concrete) aren't exposed yet — no current
    module declares a one_to_many field to show one.
    """
    # Server-owned, but the point of the record: its workflow state and its
    # document number are read by everyone who can see it, written by no one.
    shown = {decl['field'] for decl in (workflow.declaration(model), numbering.declaration(model)) if decl}
    # Schema.read_only_fields: server-owned values a reader should see (a bill's
    # paid amount, who requested a reduction): shown, never writable.
    shown |= set(getattr(getattr(model, 'Schema', None), 'read_only_fields', ()) or ())
    names = []
    for field in model._meta.get_fields():
        if field.auto_created and not field.concrete:
            continue
        # Other server-owned fields (the audit fields, a transition's actor)
        # are not part of what a user reads or writes through a form.
        # `editable=False` is Django's own marker for them.
        if not field.editable and not field.primary_key and field.name not in shown:
            continue
        names.append(field.name)
    return names


def readable_computed(model, readable, user=None):
    """
    Computed field names whose every dependency is in `readable`, and (when it
    reads other models' rows) whose `requires` models `user` may all view.
    """
    names = []
    for name, spec in computed_fields.declarations(model).items():
        if not all(dependency in readable for dependency in computed_fields.dependencies(spec)):
            continue
        required = spec.get('requires', ())
        if required and (user is None or not all(can(user, apps.get_model(label), 'view') for label in required)):
            continue
        names.append(name)
    return names


def related_lists(model, user):
    """
    The reverse relations a model's Schema asks to show under its form,
    narrowed to what this user may see:

        related_lists = [
            {'relation': 'children', 'label': 'People',
             'columns': ['name', 'job_title', 'email']},
        ]

    `relation` is the reverse accessor (the ForeignKey's related_name).
    A list appears only if the user can view the target model and read the
    linking field on it; `can_add` only if they may create a target record and
    set that field. The frontend renders each with the ordinary list renderer,
    filtered to this record.
    """
    schema_cls = getattr(model, 'Schema', None)
    entries = []
    for declared in getattr(schema_cls, 'related_lists', []) or []:
        try:
            relation = model._meta.get_field(declared['relation'])
        except FieldDoesNotExist:
            continue  # the module that adds this relation isn't installed
        target = relation.related_model
        link = relation.field.name
        if not is_exposed(target) or not can(user, target, 'view'):
            continue
        target_access = field_access(user, target, schema_field_names(target))
        if link not in target_access:
            continue
        target_meta = target._meta
        entries.append({
            'name': declared['relation'],
            'label': declared.get('label') or _sentence_case(target_meta.verbose_name_plural),
            'target': {'app_label': target_meta.app_label, 'model': target_meta.model_name},
            'field': link,
            'columns': [c for c in declared.get('columns', []) if c in target_access],
            'can_add': can(user, target, 'add') and target_access[link] == WRITE,
        })
    return entries


def _computed_entry(model, spec):
    entry = {
        'type': spec['type'],
        'label': spec['label'],
        'required': False,
        'read_only': True,
        'read_only_on_create': True,
        'visible_when': None,
        'computed': {
            'from': computed_fields.dependencies(spec),
            'description': computed_fields.describe(model, spec),
        },
    }
    if spec['type'] in ('currency', 'decimal'):
        entry['decimal_places'] = (
            settings.CLICKER_CURRENCY['decimal_places'] if spec['type'] == 'currency' else spec.get('decimal_places', 2)
        )
    if spec['type'] == 'currency':
        entry['currency'] = settings.CLICKER_CURRENCY['code']
    if spec['type'] == 'selection':
        entry['choices'] = [{'value': value, 'label': label} for value, label in spec['choices']]
        if spec.get('tones'):
            entry['tones'] = dict(spec['tones'])
    if spec.get('buckets'):
        # Ranges a list can be grouped into ("0–30 days", "31–60 days"…),
        # each {label, min?, max?}, inclusive.
        entry['buckets'] = [dict(bucket) for bucket in spec['buckets']]
    return entry


def all_fields(model):
    """
    Every field a schema could show for `model`, typed, with no user in mind.
    For checking a model's own declarations at startup (a view's filters, a
    summary's field), never for answering a request.
    """
    schema_cls = getattr(model, 'Schema', None)
    overrides = {
        'field_types': getattr(schema_cls, 'field_types', {}),
        'visible_when': getattr(schema_cls, 'visible_when', {}),
        'domains': getattr(schema_cls, 'domains', {}),
    }
    fields = {name: _field_schema(model._meta.get_field(name), overrides) for name in schema_field_names(model)}
    for name, spec in computed_fields.declarations(model).items():
        fields[name] = _computed_entry(model, spec)
    return fields


def _list_tools(model, fields):
    """
    What a list can do with this user's fields: which they can group by, and
    the model's summaries (labels only; the values come from the aggregate
    endpoint). Saved views, module and personal, come from /api/views/.
    """
    from data import query

    summaries = []
    for index, spec in enumerate(query.declared_summaries(model)):
        if spec.get('field') is not None and spec['field'] not in fields:
            continue
        if query._filter_problems(spec.get('filter', []), fields, ''):
            continue
        summaries.append({'key': str(index), 'label': spec['label'], 'aggregate': spec['aggregate']})
    return {
        'groupable': [name for name, entry in fields.items() if query.groupable(entry)],
        'summaries': summaries,
    }


def _write_once_note(model, field_name):
    """What a write-once field tells the person, before and after they set it."""
    roles = roles_that_can_change(model, field_name)
    if not roles:
        return 'Set when the record is created. It can’t be changed afterwards.'
    article = 'an' if roles[0][:1].lower() in 'aeiou' else 'a'
    return f'Set when the record is created. Ask {article} {" or ".join(roles)} to change it.'


SCHEMA_MODES = ('create', 'edit')


def build_schema(model, user, mode=None):
    """
    The schema `user` receives for `model`, or None if they can't see it.

    This is the permission check, not a picture of it: the API enforces the
    same `field_access` answer this function filters by. Hidden fields are
    absent everywhere (fields, groups, list columns, sort, search, default
    filters); fields the user may read but not write come back `read_only`
    (for editing an existing record) and `read_only_on_create` (for a new
    one); `actions` says which writes the user may attempt at all.

    A write-once field (writable on create only) is writable in the create
    flags and read-only in the edit ones, and carries `write_once.note`, the
    rule in words, so the form can say it before and after.

    `mode` narrows the answer to one form: `create` or `edit` makes
    `read_only` mean that mode's answer. Without it both flags are sent, which
    is what a form that may be either uses.
    """
    if mode is not None and mode not in SCHEMA_MODES:
        raise ValueError(f'Unknown schema mode {mode!r}')
    if not can(user, model, 'view'):
        return None

    meta = model._meta
    schema_cls = getattr(model, 'Schema', None)
    overrides = {
        'field_types': getattr(schema_cls, 'field_types', {}),
        'visible_when': getattr(schema_cls, 'visible_when', {}),
        'domains': getattr(schema_cls, 'domains', {}),
    }

    all_names = schema_field_names(model)
    access = field_access(user, model, all_names)
    computed_specs = computed_fields.declarations(model)
    may_update = can(user, model, 'change')
    may_create = can(user, model, 'add')

    fields = {}
    for name in all_names:
        if name not in access:
            continue
        entry = _field_schema(meta.get_field(name), overrides)
        writable = access[name] == WRITE
        create_only = access[name] == CREATE_ONLY
        entry['read_only_on_create'] = entry['read_only'] or not ((writable or create_only) and may_create)
        entry['read_only'] = entry['read_only'] or not (writable and may_update)
        if create_only and may_create:
            entry['write_once'] = {'note': _write_once_note(model, name)}
        if mode == 'create':
            entry['read_only'] = entry['read_only_on_create']
        fields[name] = entry

    # Computed fields: read-only for everyone, and visible only to someone
    # who can read everything they're calculated from.
    for name in readable_computed(model, set(access), user):
        fields[name] = _computed_entry(model, computed_specs[name])

    # A document number is empty until the record is saved; the form says so
    # rather than showing a blank that looks like something to fill in.
    numbered = numbering.declaration(model)
    if numbered and numbered['field'] in fields:
        fields[numbered['field']]['assigned'] = 'Assigned when saved'

    # Archiving: a boolean field where False means archived. Archived records
    # leave lists and pickers until asked for; archiving is an edit of that
    # one field, so it's allowed exactly when the user may write it.
    archive_field = getattr(schema_cls, 'archive_field', None)
    may_archive = bool(archive_field) and archive_field in fields and not fields[archive_field]['read_only'] and may_update

    # An auto-created primary key is the record's identity, not something a
    # user fills in — the form shows it in its header, not as a field. It
    # stays in `fields` (a list column may still want it); it just never
    # lands in a form group by default. A model can still place it in a
    # group explicitly if it ever has a reason to.
    auto_pk = meta.pk.name if isinstance(meta.pk, (djm.AutoField, djm.BigAutoField)) else None
    form_field_names = [name for name in all_names if name != auto_pk] + [
        name for name, spec in computed_specs.items() if spec.get('form', True)
    ]

    # Groups are laid out from every field (so "Ungrouped" still catches an
    # author's oversight), then narrowed to what this user may see.
    groups = []
    for group in _build_groups(schema_cls, form_field_names):
        visible = [name for name in group['fields'] if name in fields]
        if visible:
            groups.append({'label': group['label'], 'fields': visible})

    return {
        'model': meta.model_name,
        'app_label': meta.app_label,
        'verbose_name': str(meta.verbose_name),
        'verbose_name_plural': str(meta.verbose_name_plural),
        'display_field': getattr(schema_cls, 'display_field', None),
        'groups': groups,
        'list': {
            'columns': [c for c in getattr(schema_cls, 'list_display', all_names) if c in fields],
            'sort': [s for s in getattr(schema_cls, 'list_sort', []) if s['field'] in fields],
            'default_filters': {
                k: v for k, v in getattr(schema_cls, 'list_filter_defaults', {}).items() if k in fields
            },
            'search_fields': [f for f in getattr(schema_cls, 'search_fields', []) if f in fields],
            **_list_tools(model, fields),
        },
        'fields': fields,
        'related_lists': related_lists(model, user),
        # States and the transitions this user holds a grant for (none others).
        'workflow': workflow.schema_for(user, model),
        'archive_field': archive_field if archive_field in fields else None,
        'actions': {
            'view': True,
            'create': may_create,
            'update': may_update,
            'archive': may_archive,
            'delete': can(user, model, 'delete'),
        },
    }
