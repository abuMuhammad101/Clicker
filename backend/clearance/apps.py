from django.apps import AppConfig


class ClearanceConfig(AppConfig):
    """Journey B: a port clearing agency's jobs, containers and disbursements, invoiced through the billing core."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'clearance'
    verbose_name = 'Clearing agency'
