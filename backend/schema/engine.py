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

    return {
        'model': meta.model_name,
        'app_label': meta.app_label,
        'verbose_name': str(meta.verbose_name),
        'verbose_name_plural': str(meta.verbose_name_plural),
        'display_field': getattr(schema_cls, 'display_field', None),
        'list': {
            'columns': getattr(schema_cls, 'list_display', list(fields.keys())),
            'sort': getattr(schema_cls, 'list_sort', []),
            'default_filters': getattr(schema_cls, 'list_filter_defaults', {}),
            'search_fields': getattr(schema_cls, 'search_fields', []),
        },
        'fields': fields,
    }
