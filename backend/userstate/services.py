import logging

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from .models import RecordView

logger = logging.getLogger(__name__)


def record_view(user, obj):
    """
    Note that `user` just looked at `obj`: insert, or move an existing row to
    now. Never raises — a failure to remember a view must not break showing
    the record, which is the thing the user actually asked for.
    """
    try:
        RecordView.objects.update_or_create(
            user=user,
            content_type=ContentType.objects.get_for_model(type(obj)),
            object_id=obj.pk,
            defaults={'viewed_at': timezone.now()},
        )
    except Exception:
        logger.exception('Could not record a view of %r', obj)
