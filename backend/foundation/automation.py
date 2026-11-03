"""
Scheduled work, declared once and runnable from one command:

    python manage.py run_automations

An automation is a function taking an `actions.Context`; it acts as the
system user, so every record it writes is audited under "Clicker automation",
never a person's name and never blank. It must be idempotent (running it
twice does nothing the second time), which is what lets it move to a
scheduler (cron, a task queue) without change.

    @automation('open_recovery_cases', 'One-line description for the run report')
    def open_recovery_cases(ctx):
        ...
        return 'opened 4 cases'      # shown in the run report
"""
from importlib import import_module

from django.apps import apps

from . import actions

REGISTRY = {}


def automation(name, description):
    def register(function):
        REGISTRY[name] = {'name': name, 'description': description, 'run': function}
        return function

    return register


def discover():
    """Import every installed app's `automations` module so its automations register."""
    for config in apps.get_app_configs():
        try:
            import_module(f'{config.name}.automations')
        except ModuleNotFoundError as error:
            if error.name != f'{config.name}.automations':
                raise


def run_all(only=None):
    """Run every registered automation (or `only` one) as the system user. Returns [(name, report)]."""
    discover()
    ctx = actions.system_context()
    names = [only] if only else list(REGISTRY)
    return [(name, REGISTRY[name]['run'](ctx)) for name in names]
