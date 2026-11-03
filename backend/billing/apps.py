from django.apps import AppConfig


class BillingConfig(AppConfig):
    """
    The shared receivables core: bills, payments with oldest-first allocation,
    and approved reductions. Nothing here belongs to one business: a water
    utility and a clearing agency both bill, collect and reduce the same way.
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'billing'
    verbose_name = 'Billing'
