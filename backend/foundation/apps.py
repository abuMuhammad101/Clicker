from django.apps import AppConfig


class FoundationConfig(AppConfig):
    """
    What every Clicker module stands on: the base model with server-owned
    audit fields, the permission rules, the audit log and the role seed.
    Not called `platform`, which would shadow Python's standard library.
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'foundation'
    verbose_name = 'Foundation'
