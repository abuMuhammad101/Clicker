from django.apps import AppConfig


class CatalogConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'catalog'
    # The module's name in navigation.
    verbose_name = 'Catalog'
