"""When a locked-out name may try again, from django-axes' own bookkeeping (not user data, so no record scoping)."""
from axes.models import AccessAttempt
from django.conf import settings
from django.utils import timezone

LOCKED_OUT_MINUTES = int(settings.AXES_COOLOFF_TIME.total_seconds() // 60)


def minutes_until_unlocked(username):
    """The cool-off, counted from this name's latest failed attempt; the full cool-off if none is on record."""
    latest = AccessAttempt.objects.filter(username=username).order_by('-attempt_time').first()
    if latest is None:
        return LOCKED_OUT_MINUTES
    remaining = latest.attempt_time + settings.AXES_COOLOFF_TIME - timezone.now()
    return max(1, -(-int(remaining.total_seconds()) // 60))
