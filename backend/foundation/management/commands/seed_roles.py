"""
`manage.py seed_roles`: (re)apply the built-in roles, and create this
machine's Clerk test user from .env if DEV_CLERK_USERNAME and
DEV_CLERK_PASSWORD are set.

The test user is a local convenience for checking what a Clerk sees. It is
never a real person's login, never staff, and its credentials live only in
this machine's .env. The command refuses to touch an account that is staff,
a superuser or a Manager, so it can't be pointed at someone's real login.
Nothing about the credentials is printed.
"""
import os

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError

from foundation.roles import CLERK, MANAGER, seed_roles


class Command(BaseCommand):
    help = 'Apply the built-in roles and create the local Clerk test user from .env.'

    def handle(self, *args, **options):
        seed_roles()
        self.stdout.write('Roles applied: Manager, Clerk.')

        username = os.environ.get('DEV_CLERK_USERNAME', '').strip()
        password = os.environ.get('DEV_CLERK_PASSWORD', '')
        if not username or not password:
            self.stdout.write('No Clerk test user: set DEV_CLERK_USERNAME and DEV_CLERK_PASSWORD in .env to create one.')
            return

        User = get_user_model()
        user = User.objects.filter(username=username).first()
        if user is not None and (user.is_staff or user.is_superuser or user.groups.filter(name=MANAGER).exists()):
            raise CommandError('DEV_CLERK_USERNAME names a staff, superuser or Manager account. Pick a test-only name.')

        try:
            validate_password(password, user=user)
        except Exception as error:
            raise CommandError(f'DEV_CLERK_PASSWORD is too weak: {" ".join(getattr(error, "messages", [str(error)]))}')

        created = user is None
        if created:
            user = User(username=username)
        user.set_password(password)
        user.is_active = True
        user.save()
        user.groups.set([Group.objects.get(name=CLERK)])
        self.stdout.write(f'Clerk test user {"created" if created else "updated"} (DEV_CLERK_USERNAME).')
