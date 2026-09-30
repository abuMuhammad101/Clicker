"""
One serializer for every exposed model, built at request time from the model
itself. There is no ContactSerializer and there must never be one: if a model
needs something this file can't express, the gap is here or in the schema
engine, not in a per-model class.

Output does not go through DRF's field serializers — `serialize_record` builds
the record envelope directly from the schema so the frontend gets exactly the
field names the schema declares. DRF is used for what it's good at: parsing
and validating input.
"""
import copy

from django.core.exceptions import FieldDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models as djm
from rest_framework import serializers

from schema.engine import build_schema, display_label


class ModelRecordSerializer(serializers.ModelSerializer):
    def to_internal_value(self, data):
        # The frontend sends null for an emptied text input. Django stores an
        # empty CharField/TextField as '' (null=False), and DRF would reject
        # the null outright. Treat null as "empty" for those fields so the API
        # has one meaning for "no value" regardless of how Django stores it.
        data = dict(data)
        meta = self.Meta.model._meta
        for name, value in data.items():
            if value is not None:
                continue
            try:
                field = meta.get_field(name)
            except FieldDoesNotExist:
                continue
            if isinstance(field, (djm.CharField, djm.TextField)) and not field.null:
                data[name] = ''
        return super().to_internal_value(data)

    def validate(self, attrs):
        # DRF never calls Model.clean() — Django Admin does, which is why the
        # parent/cycle rules in Contact.clean() have only ever been enforced
        # there. Build the would-be record (a copy, so a failed validation
        # leaves the real instance untouched) and run the model's full
        # validation: field checks, clean(), unique and constraint checks.
        if self.instance is not None:
            candidate = copy.copy(self.instance)
        else:
            candidate = self.Meta.model()
        for name, value in attrs.items():
            setattr(candidate, name, value)

        try:
            candidate.full_clean()
        except DjangoValidationError as error:
            # as_serializer_error maps Django's NON_FIELD_ERRORS key onto DRF's
            # non_field_errors, so the response shape is the same whichever
            # layer raised.
            raise serializers.ValidationError(serializers.as_serializer_error(error))
        return attrs


def serializer_for(model):
    editable = [
        field.name
        for field in model._meta.concrete_fields
        if field.editable and not field.primary_key
    ]
    meta = type('Meta', (), {'model': model, 'fields': editable})
    return type(f'{model.__name__}RecordSerializer', (ModelRecordSerializer,), {'Meta': meta})


def serialize_record(obj, schema=None):
    """
    The record envelope:

        {
          "id": 7,
          "display": "Jane Doe (Acme Corp)",
          "values": {field_name: value, ...},   # exactly the schema's fields
          "labels": {fk_field_name: "Acme Corp" | null, ...}
        }

    `values` holds a many_to_one as its bare id — the same shape the API
    accepts back on write. `labels` carries the human label for each
    relation separately, so the picker can show "Acme Corp" without a second
    request and without the value itself changing shape between read and
    write.
    """
    model = type(obj)
    schema = schema or build_schema(model)
    meta = model._meta

    values = {}
    labels = {}
    for name, field_schema in schema['fields'].items():
        field = meta.get_field(name)
        if field_schema['type'] == 'many_to_one':
            values[name] = getattr(obj, field.attname)
            related = getattr(obj, name)
            labels[name] = display_label(related) if related is not None else None
        else:
            values[name] = field.value_from_object(obj)

    return {
        'id': obj.pk,
        'display': display_label(obj),
        'values': values,
        'labels': labels,
    }
