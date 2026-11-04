"""Ending a person's sessions: a deactivated team member is signed out everywhere, at once."""
from django.contrib.sessions.models import Session
from django.utils import timezone


def end_sessions(user):
    """Delete every live session that belongs to `user`. Returns how many."""
    ended = 0
    for session in Session.objects.filter(expire_date__gt=timezone.now()):
        if str(session.get_decoded().get('_auth_user_id')) == str(user.pk):
            session.delete()
            ended += 1
    return ended
