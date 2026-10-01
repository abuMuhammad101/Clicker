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
from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

# One message for every failure. Saying which half was wrong tells an
# attacker which usernames exist.
INVALID_CREDENTIALS = 'Username or password is incorrect.'


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
        user = authenticate(request, username=username.strip(), password=password)
        if user is None:
            return Response({'detail': INVALID_CREDENTIALS}, status=status.HTTP_400_BAD_REQUEST)

        login(request, user)
        return Response({'user': _user_payload(user), 'csrf_token': get_token(request)})


@method_decorator(csrf_protect, name='dispatch')
class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response({'user': _user_payload(request.user), 'csrf_token': get_token(request)})
