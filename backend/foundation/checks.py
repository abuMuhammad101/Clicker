"""System checks: a Schema that names a field that doesn't exist is a startup error."""
from django.apps import apps
from django.core import checks
from django.core.exceptions import FieldDoesNotExist


@checks.register()
def restricted_fields_exist(app_configs=None, **kwargs):
    from .permissions import restricted_fields

    errors = []
    for model in apps.get_models():
        for name in restricted_fields(model):
            try:
                model._meta.get_field(name)
            except FieldDoesNotExist:
                errors.append(
                    checks.Error(
                        f'Schema.restricted_fields names "{name}", which is not a field.',
                        obj=model,
                        id='foundation.E001',
                    )
                )
    return errors
