"""
After every `migrate`, make sure the permission rows Clicker's rules depend
on exist. Django creates model permissions itself (view/add/change/delete),
but only per app as each app's migrations finish; the field-level grants are
Clicker's own. Running here, once, after everything has migrated, also means
the test database gets them without any test having to remember.
"""
from django.apps import apps
from django.contrib.auth.management import create_permissions


def ensure_permissions(sender, using='default', verbosity=0, **kwargs):
    from schema.engine import is_exposed

    from .permissions import ensure_field_permissions

    # Model permissions for every app first, so anything that grants them
    # (the role seed) finds them regardless of INSTALLED_APPS order.
    for app_config in apps.get_app_configs():
        create_permissions(app_config, verbosity=0, using=using)
    ensure_field_permissions([model for model in apps.get_models() if is_exposed(model)])
