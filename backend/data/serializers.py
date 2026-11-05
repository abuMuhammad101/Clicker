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

from foundation.models import ClickerModel

from schema.engine import display_label, json_safe


# One message for every key a client may not send: a field that doesn't exist,
# one they can't see, one they can see but not change, a server-owned one.
# Distinguishing them would tell a probing client which hidden fields exist.
NOT_WRITABLE = 'This field can’t be set.'


class ModelRecordSerializer(serializers.ModelSerializer):
    def get_fields(self):
        fields = super().get_fields()
        # Say what to do, not what DRF says: "Choose a client." and "Goods can't be empty.", never
        # "This field may not be null.".
        for field in fields.values():
            label = str(field.label or '').strip()
            relation = isinstance(field, serializers.PrimaryKeyRelatedField)
            sentence = f'Choose a {label.lower()}.' if relation else f'{label[:1].upper()}{label[1:]} can’t be empty.'
            for key in ('null', 'blank', 'required'):
                if key in field.error_messages:
                    field.error_messages[key] = sentence
        return fields

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError({'non_field_errors': ['Expected an object of field values.']})
        # The write allowlist: only fields this user's schema marks writable.
        # Anything else is refused by name, never silently dropped, so a
        # client can't believe it changed something it didn't.
        refused = sorted(name for name in data if name not in self.Meta.fields)
        if refused:
            raise serializers.ValidationError({name: [NOT_WRITABLE] for name in refused})

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


# A link to a record that doesn't exist and one the user can't see get the
# same answer: telling them apart would confirm the hidden record exists.
NOT_LINKABLE = 'Choose a record from the list.'


def serializer_for(model, writable, user):
    """
    A serializer that accepts exactly `writable` (from data.access.writable_fields
    for this user and action). Server-owned and primary-key fields can never be
    in it: they aren't editable, so field_access never marks them writable.

    Every many_to_one is declared here, not left to DRF: its candidates are the
    target's *scoped* queryset for this user, so a write can only link to a
    record the user can see. (DRF's generated field would accept any id.)
    """
    from .access import scoped_queryset

    editable = [
        field.name
        for field in model._meta.concrete_fields
        if field.editable and not field.primary_key and field.name in writable
    ]
    declared = {}
    for name in editable:
        field = model._meta.get_field(name)
        if isinstance(field, djm.ForeignKey):
            declared[name] = serializers.PrimaryKeyRelatedField(
                queryset=scoped_queryset(user, field.related_model, 'view'),
                allow_null=field.null,
                required=not (field.blank or field.has_default()),
                error_messages={'does_not_exist': NOT_LINKABLE, 'incorrect_type': NOT_LINKABLE},
            )
    meta = type('Meta', (), {'model': model, 'fields': editable})
    return type(f'{model.__name__}RecordSerializer', (ModelRecordSerializer,), {'Meta': meta, **declared})


def serialize_record(obj, schema, visible_related):
    """
    The record envelope:

        {
          "id": 7,
          "display": "Jane Doe (Acme Corp)",
          "values": {field_name: value, ...},   # exactly the schema's fields
          "labels": {fk_field_name: "Acme Corp" | null, ...},
          "restricted": {fk_field_name: true, ...},   # links the user can't see
          "meta": {"created_at": ..., "updated_at": ..., "created_by": ..., "updated_by": ...}
        }

    `schema` is always the requesting user's: only the fields they may read are
    in it, so only those reach the envelope. `visible_related` is
    data.access.visible_related_ids for these records: a link's label is given
    only when the user may see the linked record. Otherwise the id stays (it's
    part of this record) and the label is null, marked restricted.

    Decimals go out as strings, never floats (json_safe); computed values are
    read from the scoped queryset's annotations.
    """
    model = type(obj)
    meta = model._meta

    values = {}
    labels = {}
    restricted = {}
    for name, field_schema in schema['fields'].items():
        if 'computed' in field_schema:
            values[name] = json_safe(getattr(obj, name, None))
            continue
        field = meta.get_field(name)
        if field_schema['type'] == 'many_to_one':
            linked = getattr(obj, field.attname)
            values[name] = linked
            if linked is not None and linked in visible_related.get(name, set()):
                labels[name] = display_label(getattr(obj, name))
            else:
                labels[name] = None
                if linked is not None:
                    restricted[name] = True
        else:
            values[name] = json_safe(field.value_from_object(obj))

    envelope = {
        'id': obj.pk,
        'display': display_label(obj),
        'values': values,
        'labels': labels,
        'restricted': restricted,
    }
    if isinstance(obj, ClickerModel):
        envelope['meta'] = {
            'created_at': json_safe(obj.created_at),
            'updated_at': json_safe(obj.updated_at),
            'created_by': _person(obj.created_by),
            'updated_by': _person(obj.updated_by),
        }
    return envelope


def _person(user):
    if user is None:
        return None
    return {'id': user.pk, 'display_name': user.get_full_name() or user.get_username()}
