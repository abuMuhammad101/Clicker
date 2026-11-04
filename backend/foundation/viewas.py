"""
"View as role": an Owner or Manager sees the app exactly as a role sees it.

It is not a second implementation of anything. A request that carries
`X-View-As-Role: <role>` is answered by the very same views and permission
functions (`data/access.py`, `schema/engine.py`), with one change: the user
those functions are asked about is a *representative of the role* (a real member
of it if there is one, else a synthetic account that can't sign in) instead of
the person asking. So what comes back is, byte for byte, what the role gets.

Read-only is enforced here, on the server: any request that isn't a read is
refused while a role is being viewed, and starting a session is audited. Only
someone holding `core.view_as_role` (Owner and Manager) can send the header at
all; for anyone else it is a 403, whatever they ask for.
"""
import re

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import Count
from django.http import JsonResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from .actions import SYSTEM_USERNAME
from .audit import client_ip, record_change
from .models import AuditEntry
from .roles import active_roles

PERMISSION = 'core.view_as_role'
HEADER = 'HTTP_X_VIEW_AS_ROLE'
SAFE = ('GET', 'HEAD', 'OPTIONS')
PREFIX = 'view-as-'


def _slug(role):
    return PREFIX + re.sub(r'[^a-z0-9]+', '-', role.lower()).strip('-')


def viewable_roles():
    """The roles that can be viewed here: groups that exist and belong to the running journey."""
    allowed = active_roles()
    names = Group.objects.order_by('name').values_list('name', flat=True)
    return [name for name in names if allowed is None or name in allowed]


def representative_user(role, create=False):
    """
    Someone to ask the permission functions about, on the role's behalf: a real member whose only
    role is this one (so their record rules answer too), else a synthetic account with no password.
    None when there is no such role, or (without `create`) no representative yet.
    """
    group = Group.objects.filter(name=role).first()
    if group is None or role not in viewable_roles():
        return None
    User = get_user_model()
    real = (
        User.objects.filter(is_active=True, groups=group)
        .exclude(username__startswith=PREFIX)
        .exclude(username=SYSTEM_USERNAME)
        .annotate(held=Count('groups'))
        .filter(held=1)
        .order_by('id')
        .first()
    )
    if real is not None:
        return real
    username = _slug(role)
    user = User.objects.filter(username=username).first()
    if user is None and create:
        user = User(username=username, first_name='View as', last_name=role, is_active=True)
        user.set_unusable_password()
        user.save()
        user.groups.add(group)
    return user


def _refuse(status, detail):
    return JsonResponse({'detail': detail}, status=status)


class ViewAsMiddleware:
    """Swap in the role's representative for a read-only request that asks to be answered as that role."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        role = request.META.get(HEADER)
        path = request.path
        if role and path.startswith('/api/') and not path.startswith(('/api/auth/', '/api/view-as/')):
            real = request.user
            if real.is_authenticated:
                if not real.has_perm(PERMISSION):
                    return _refuse(403, 'You can’t view the app as another role.')
                if request.method not in SAFE:
                    return _refuse(403, f'You are viewing as {role}. Nothing here can be changed.')
                representative = representative_user(role)
                if representative is None:
                    return _refuse(404, f'There is no role called “{role}” to view as.')
                request.real_user = real
                request.user = representative
                request.view_as = role
        return self.get_response(request)


class RolesView(APIView):
    """GET /api/view-as/roles/: the roles that can be viewed, with how many people hold each."""

    def get(self, request):
        if not request.user.has_perm(PERMISSION):
            return _refuse(403, 'You can’t view the app as another role.')
        counts = dict(
            Group.objects.annotate(n=Count('user')).values_list('name', 'n')
        )
        return Response({'roles': [{'role': name, 'members': counts.get(name, 0)} for name in viewable_roles()]})


class StartView(APIView):
    """POST /api/view-as/start/ {"role": "Field agent"}: audit the start and make sure the role has a representative."""

    def post(self, request):
        if not request.user.has_perm(PERMISSION):
            return _refuse(403, 'You can’t view the app as another role.')
        role = request.data.get('role')
        representative = representative_user(role, create=True) if isinstance(role, str) else None
        if representative is None:
            return _refuse(404, 'There is no such role to view as.')
        person = get_user_model().objects.get(pk=request.user.pk)
        record_change(
            actor=person,
            ip_address=client_ip(request),
            obj=person,
            action=AuditEntry.ACTION_VIEW_AS,
            before=None,
            after={},
            summary=f'Started viewing the app as {role}',
        )
        return Response({'role': role, 'as': representative.get_full_name() or representative.get_username()})
