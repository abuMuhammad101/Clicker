"""
The four auth endpoints:

    GET  /api/auth/csrf/     public — a CSRF token, so the login form can POST
    POST /api/auth/login/    public — username + password → session
    POST /api/auth/logout/   ends the session server-side
    GET  /api/auth/me/       the current user, or 401

The CSRF token travels in JSON rather than being read from the cookie by
page scripts, so both cookies stay httpOnly. Django rotates the token on
login, which is why login and me return a fresh one.
"""
from axes.handlers.proxy import AxesProxyHandler
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from foundation.middleware import mark_session_start

# One message for every failure. Saying which half was wrong tells an
# attacker which usernames exist.
INVALID_CREDENTIALS = 'Username or password is incorrect.'

# After too many failures for one username from one address. It says nothing
# about whether that username exists: the lock applies to any name typed.
LOCKED_OUT = 'Too many failed sign-ins. Wait 15 minutes, then try again.'


def locked_out_response(request, *args, **kwargs):
    """django-axes' lockout response (AXES_LOCKOUT_CALLABLE), as the API speaks it."""
    return JsonResponse({'detail': LOCKED_OUT}, status=429)


def _user_payload(user):
    full_name = user.get_full_name()
    return {
        'id': user.pk,
        'username': user.get_username(),
        'display_name': full_name or user.get_username(),
        'email': user.email,
    }


@method_decorator(ensure_csrf_cookie, name='dispatch')
class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'csrf_token': get_token(request)})


# DRF views are csrf_exempt, and DRF only enforces CSRF for requests that are
# already authenticated. Login comes from an anonymous user, so it needs the
# check applied explicitly — otherwise another site could log a visitor into
# an account of its choosing (login CSRF).
@method_decorator(csrf_protect, name='dispatch')
class LoginView(APIView):
    permission_classes = [AllowAny]
    # No authentication at all on this endpoint: a stale or half-valid
    # session must never turn a login attempt into a 401.
    authentication_classes = []

    def post(self, request):
        username = request.data.get('username', '')
        password = request.data.get('password', '')
        if not isinstance(username, str) or not isinstance(password, str):
            return Response({'detail': INVALID_CREDENTIALS}, status=status.HTTP_400_BAD_REQUEST)

        # authenticate() also rejects inactive users, under the same message.
        # It gets the plain Django request: django-axes counts failures on it
        # and marks it when this username-and-address pair is locked out.
        django_request = request._request
        credentials = {'username': username.strip()}
        # Already locked before this attempt: refuse without checking the
        # password at all, so a correct guess during the lock is worthless.
        if AxesProxyHandler.is_locked(django_request, credentials=credentials):
            return Response({'detail': LOCKED_OUT}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        user = authenticate(django_request, username=credentials['username'], password=password)
        # The failure that *reaches* the limit is still answered like any other
        # failure; the lock shows from the next attempt. (axes marks this
        # request locked, and its middleware would otherwise swap the answer.)
        django_request.axes_locked_out = False
        if user is None:
            return Response({'detail': INVALID_CREDENTIALS}, status=status.HTTP_400_BAD_REQUEST)

        login(request, user)
        mark_session_start(request)
        return Response({'user': _user_payload(user), 'csrf_token': get_token(request)})


@method_decorator(csrf_protect, name='dispatch')
class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response({'user': _user_payload(request.user), 'csrf_token': get_token(request)})
