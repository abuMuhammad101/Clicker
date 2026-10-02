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
import re

from django.db import models as djm


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
        'read_only': name == 'id',
        'visible_when': overrides['visible_when'].get(name),
    }

    max_length = getattr(field, 'max_length', None)
    if max_length:
        entry['max_length'] = max_length

    if base_type == 'decimal':
        # Precision and scale come from the field, not a frontend guess —
        # a decimal component has no correct default for either.
        entry['max_digits'] = field.max_digits
        entry['decimal_places'] = field.decimal_places

    help_text = getattr(field, 'help_text', '')
    if help_text:
        entry['help_text'] = str(help_text)

    if field.has_default():
        entry['default'] = field.get_default()

    if field.choices:
        entry['choices'] = [{'value': value, 'label': label} for value, label in field.choices]

    if base_type in ('many_to_one', 'many_to_many'):
        related_meta = field.related_model._meta
        entry['target'] = {'app_label': related_meta.app_label, 'model': related_meta.model_name}
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


def build_registry():
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
            if is_exposed(model)
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


def build_schema(model):
    meta = model._meta
    schema_cls = getattr(model, 'Schema', None)
    overrides = {
        'field_types': getattr(schema_cls, 'field_types', {}),
        'visible_when': getattr(schema_cls, 'visible_when', {}),
        'domains': getattr(schema_cls, 'domains', {}),
    }

    fields = {}
    for field in meta.get_fields():
        # Reverse relations (auto_created, not concrete) aren't exposed yet —
        # no current module declares a one_to_many field to show one.
        if field.auto_created and not field.concrete:
            continue
        fields[field.name] = _field_schema(field, overrides)

    # An auto-created primary key is the record's identity, not something a
    # user fills in — the form shows it in its header, not as a field. It
    # stays in `fields` (a list column may still want it); it just never
    # lands in a form group by default. A model can still place it in a
    # group explicitly if it ever has a reason to.
    auto_pk = meta.pk.name if isinstance(meta.pk, djm.AutoField) else None
    form_field_names = [name for name in fields if name != auto_pk]

    return {
        'model': meta.model_name,
        'app_label': meta.app_label,
        'verbose_name': str(meta.verbose_name),
        'verbose_name_plural': str(meta.verbose_name_plural),
        'display_field': getattr(schema_cls, 'display_field', None),
        'groups': _build_groups(schema_cls, form_field_names),
        'list': {
            'columns': getattr(schema_cls, 'list_display', list(fields.keys())),
            'sort': getattr(schema_cls, 'list_sort', []),
            'default_filters': getattr(schema_cls, 'list_filter_defaults', {}),
            'search_fields': getattr(schema_cls, 'search_fields', []),
        },
        'fields': fields,
    }
