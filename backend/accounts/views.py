"""
The four auth endpoints:

    GET  /api/auth/csrf/     public — a CSRF token, so the login form can POST
    POST /api/auth/login/    public — username + password → session
    POST /api/auth/logout/   ends the session server-side
    GET  /api/auth/me/       the current user, or 401
    GET  /api/auth/providers/  public — the ways to sign in, for the login screen

The CSRF token travels in JSON rather than being read from the cookie by
page scripts, so both cookies stay httpOnly. Django rotates the token on
login, which is why login and me return a fresh one.
"""
import json
import re

from axes.handlers.proxy import AxesProxyHandler
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from foundation.middleware import mark_session_start

from .lockout import LOCKED_OUT_MINUTES, minutes_until_unlocked

# One message for every failure. Saying which half was wrong tells an
# attacker which usernames exist.
INVALID_CREDENTIALS = 'That sign-in didn’t work. Check your details and try again.'

# After too many failures for one username from one address. It says nothing
# about whether that username exists: the lock applies to any name typed.
def locked_message(minutes):
    """Plain time: "Try again in 12 minutes." (never "in 0 minutes", never a fractional one)."""
    minutes = max(1, int(minutes))
    return f'Too many attempts. Try again in {minutes} minute{"" if minutes == 1 else "s"}.'


LOCKED_OUT = locked_message(LOCKED_OUT_MINUTES)


def safe_redirect(raw):
    """
    Where to go after signing in: a same-site path or Home, nothing else. The same rule as the browser's
    (features/auth/redirects.ts), checked again here, because the browser's copy is a convenience and this one
    is the guarantee. Anything with a scheme, a host, a backslash, a control character, an encoded slash that
    could become one, or a second leading slash is refused.
    """
    if not isinstance(raw, str) or not raw.startswith('/') or raw.startswith('//') or len(raw) > 2000:
        return '/'
    if any(ord(c) < 32 or c in '\\' for c in raw) or re.search(r'%(2f|5c|0[0-9a-f]|1[0-9a-f])', raw, re.IGNORECASE):
        return '/'
    if not url_has_allowed_host_and_scheme(raw, allowed_hosts=None, require_https=False):
        return '/'
    if raw == '/login' or raw.startswith('/login?') or raw.startswith('/login/'):
        return '/'
    return raw


def _username_of(request):
    try:
        return str(json.loads(request.body or b'{}').get('username', '')).strip()
    except (ValueError, AttributeError):
        return ''


def locked_out_response(request, *args, **kwargs):
    """django-axes' lockout response (AXES_LOCKOUT_CALLABLE), as the API speaks it."""
    return JsonResponse({'detail': locked_message(minutes_until_unlocked(_username_of(request)))}, status=429)


def _role_of(user):
    staff = getattr(user, 'staff', None)
    if staff is not None and staff.role:
        return staff.role
    group = user.groups.order_by('name').first()
    return group.name if group else ''


def _user_payload(user):
    full_name = user.get_full_name()
    return {
        'id': user.pk,
        'username': user.get_username(),
        'display_name': full_name or user.get_username(),
        'email': user.email,
        # Whether the person may see the app as another role (Owner and Manager).
        'can_view_as_role': user.has_perm('core.view_as_role'),
        # The role as the team page names it (a person's account follows it), for the welcome sentence.
        'role': _role_of(user),
    }


def _organisation():
    """
    What every screen formats by: the organisation's currency and time zone
    ("today", "overdue", every date shown). One organisation for now.
    """
    return {
        'currency': settings.CLICKER_CURRENCY,
        'time_zone': settings.TIME_ZONE,
        'name': settings.CLICKER_ORG_NAME,
        'promise': settings.CLICKER_ORG_PROMISE,
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
            return Response(
                {'detail': locked_message(minutes_until_unlocked(credentials['username']))}, status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        user = authenticate(django_request, username=credentials['username'], password=password)
        # The failure that *reaches* the limit is still answered like any other
        # failure; the lock shows from the next attempt. (axes marks this
        # request locked, and its middleware would otherwise swap the answer.)
        django_request.axes_locked_out = False
        if user is None:
            return Response({'detail': INVALID_CREDENTIALS}, status=status.HTTP_400_BAD_REQUEST)

        login(request, user)
        mark_session_start(request)
        return Response({
            'user': _user_payload(user),
            'organisation': _organisation(),
            'csrf_token': get_token(request),
            'redirect': safe_redirect(request.data.get('next')),
        })


@method_decorator(csrf_protect, name='dispatch')
class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProvidersView(APIView):
    """
    The sign-in methods this deployment offers, in order. The login screen
    renders from this list, so adding single sign-on later (Amazon Cognito,
    Microsoft Entra and others, via OIDC on the backend, still ending in a
    Django session) is a backend change plus one entry here: the screen
    already knows how to show more than one way in.

    Contract for a future entry: {"id": "<provider>", "label": "<shown on the
    button>"}; the screen sends the browser to /api/auth/<id>/start/.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        # The organisation's name and one line of promise, for the sign-in screen (public on purpose: no one's data).
        return Response({
            'providers': settings.CLICKER_SIGN_IN_PROVIDERS,
            'organisation': {
                'name': settings.CLICKER_ORG_NAME,
                'promise': settings.CLICKER_ORG_PROMISE,
                'login_proof': settings.CLICKER_LOGIN_PROOF,
            },
        })


class MeView(APIView):
    def get(self, request):
        return Response(
            {'user': _user_payload(request.user), 'organisation': _organisation(), 'csrf_token': get_token(request)}
        )
