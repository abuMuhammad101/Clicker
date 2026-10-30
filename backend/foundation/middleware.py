"""
The absolute session lifetime. Django's session expiry is an idle timeout
(each request pushes it out); this adds a hard limit from sign-in that
activity never extends. Past it, the session is ended and the request carries
on as anonymous, so the API answers 401 and the app asks for a sign-in.
"""
import time

from django.conf import settings
from django.contrib.auth import logout

SESSION_STARTED_KEY = 'clicker_signed_in_at'


def mark_session_start(request):
    """Called at sign-in."""
    request.session[SESSION_STARTED_KEY] = int(time.time())


class AbsoluteSessionLifetimeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, 'user', None)
        if user is not None and user.is_authenticated:
            started = request.session.get(SESSION_STARTED_KEY)
            if started is None:
                # A session from before this rule existed: its clock starts now.
                mark_session_start(request)
            elif time.time() - started > settings.CLICKER_SESSION_MAX_AGE:
                logout(request)
        return self.get_response(request)
