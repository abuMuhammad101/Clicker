from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = 'core'
    # The module's name in navigation. The app label stays `core`; this is
    # what a user sees as the group heading for its models.
    verbose_name = 'Contacts'
