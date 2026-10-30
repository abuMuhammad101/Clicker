"""Helpers for tests that need users with specific grants. Test code only."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission

from schema.engine import is_exposed


def grant(user, *perms):
    """Grant `app_label.codename` permissions directly to `user`."""
    for perm in perms:
        app_label, codename = perm.split('.', 1)
        user.user_permissions.add(
            Permission.objects.get(content_type__app_label=app_label, codename=codename)
        )
    # Django caches a user's permissions on the instance; a fresh fetch sees the grant.
    return get_user_model().objects.get(pk=user.pk)


def grant_everything(user):
    """Every permission on every exposed model, field grants included (a Manager)."""
    from django.apps import apps
    from django.contrib.contenttypes.models import ContentType

    models = [model for model in apps.get_models() if is_exposed(model)]
    content_types = ContentType.objects.get_for_models(*models).values()
    user.user_permissions.add(*Permission.objects.filter(content_type__in=content_types))
    return get_user_model().objects.get(pk=user.pk)


def make_user(username, *perms):
    user = get_user_model().objects.create_user(username, password='not-a-real-password-1')
    return grant(user, *perms) if perms else user
