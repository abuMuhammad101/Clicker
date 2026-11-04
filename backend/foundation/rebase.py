"""
Moving a demo's story forward in time. The seed writes every date relative to the day it ran; a demo
database a few days old would show "overdue since last Tuesday" for something that should be due
tomorrow. `rebase_dates` shifts every calendar date in the demo's models by the same number of days, so
the story is correct on the morning of the demo.

Only dates move: the audit trail keeps the real time each thing happened (it is append-only, and "who
did what" doesn't change because the calendar did). The day the story was last anchored is kept in
the database, so rebasing is exactly "today minus that day" and running it twice on one day does nothing.
"""
import datetime

from django.apps import apps
from django.db import models, transaction
from django.db.models import F

from .models import Sequence

ANCHOR_KEY = 'demo:anchor'
# The apps whose records the demos write; calendar dates in them belong to the story.
DEMO_APPS = ('core', 'billing', 'water', 'clearance')


def anchor():
    """The day the story was last anchored to, or None if it never was."""
    row = Sequence.objects.filter(key=ANCHOR_KEY).first()
    return datetime.date.fromordinal(row.last) if row else None


def set_anchor(day):
    Sequence.objects.update_or_create(key=ANCHOR_KEY, defaults={'last': day.toordinal()})


def date_fields():
    """(model, field name) for every calendar-date column in the demo apps."""
    found = []
    for app_label in DEMO_APPS:
        for model in apps.get_app_config(app_label).get_models():
            for field in model._meta.concrete_fields:
                if isinstance(field, models.DateField) and not isinstance(field, models.DateTimeField):
                    found.append((model, field.name))
    return found


@transaction.atomic
def rebase_dates(today):
    """Shift every demo date by (today − anchor) days. Returns that number of days."""
    was = anchor()
    if was is None:
        set_anchor(today)
        return 0
    days = (today - was).days
    if days == 0:
        return 0
    step = datetime.timedelta(days=days)
    for model, name in date_fields():
        model._base_manager.update(**{name: F(name) + step})
    set_anchor(today)
    return days
