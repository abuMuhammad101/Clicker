from django.apps import AppConfig


class WaterConfig(AppConfig):
    """Journey A: a water utility's bulk billing and recovery, built on the billing core."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'water'
    verbose_name = 'Water utility'

    def ready(self):
        from . import automations  # noqa: F401  (registers the scheduled work)
