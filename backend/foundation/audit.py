"""
Writing and reading the audit log. The data layer calls `record_change` inside
the same transaction as the write it describes; `history_for` is what the
per-record timeline reads (S-4/S-6), already narrowed to what the reader may
see.
"""
import json

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import FieldDoesNotExist
from django.core.serializers.json import DjangoJSONEncoder

from .models import AuditEntry


def _json_safe(value):
    # Decimals become strings, dates ISO strings: exact, and stable to compare.
    return json.loads(json.dumps(value, cls=DjangoJSONEncoder))


def _is_link(obj, name):
    try:
        field = obj._meta.get_field(name)
    except FieldDoesNotExist:
        return False
    return bool(field.is_relation and field.many_to_one)


def snapshot(obj, field_names):
    """The stored values of `field_names` on `obj` (a relation as its id)."""
    meta = obj._meta
    values = {}
    for name in field_names:
        field = meta.get_field(name)
        values[name] = _json_safe(getattr(obj, field.attname))
    return values


def client_ip(request):
    """
    The address the request came from. Behind a reverse proxy (production),
    the proxy appends the client's address to X-Forwarded-For; with
    CLICKER_TRUSTED_PROXY_COUNT proxies in front, the client is that many
    entries from the right. Anything further left was written by the client
    and can't be trusted. With no proxy configured, REMOTE_ADDR is the client.
    """
    proxies = getattr(settings, 'CLICKER_TRUSTED_PROXY_COUNT', 0)
    if proxies:
        forwarded = [part.strip() for part in request.META.get('HTTP_X_FORWARDED_FOR', '').split(',') if part.strip()]
        if len(forwarded) >= proxies:
            return forwarded[-proxies]
    return request.META.get('REMOTE_ADDR') or None


def record_change(*, actor, ip_address, obj, action, before, after, summary=''):
    """
    Append one entry. `before` is None on create. Only fields whose value
    changed are kept; a save that changed nothing still leaves an entry,
    because someone did save. `summary` says what happened in words when the
    changes alone don't.
    """
    if before is None:
        changes = {name: {'before': None, 'after': value} for name, value in after.items()}
    else:
        changes = {
            name: {'before': before.get(name), 'after': value}
            for name, value in after.items()
            if before.get(name) != value
        }
    return AuditEntry.objects.create(
        actor=actor,
        actor_username=actor.get_username() if actor else '',
        ip_address=ip_address,
        content_type=ContentType.objects.get_for_model(type(obj)),
        record_id=str(obj.pk),
        action=action,
        changes=changes,
        summary=summary,
    )


def history_for(obj, readable_fields, labels_for=None):
    """
    One record's entries, newest first, with every change to a field the
    reader can't read removed: history must not leak what the schema hides.
    The IP address stays out of the API; Django admin shows it.

    `labels_for(field_name, ids)` names the records a link changed from and
    to, through the target's own scope: an id the reader can't see stays an
    id, never a name.
    """
    entries = AuditEntry.objects.filter(
        content_type=ContentType.objects.get_for_model(type(obj)), record_id=str(obj.pk)
    ).select_related('actor')
    entries = list(entries)
    shown = [
        {name: dict(change) for name, change in entry.changes.items() if name in readable_fields}
        for entry in entries
    ]
    if labels_for:
        links = {}
        for changes in shown:
            for name, change in changes.items():
                if _is_link(obj, name):
                    links.setdefault(name, set()).update(v for v in (change['before'], change['after']) if v is not None)
        names = {name: labels_for(name, sorted(ids)) for name, ids in links.items()}
        for changes in shown:
            for name, change in changes.items():
                if name in names:
                    change['before_label'] = names[name].get(change['before'])
                    change['after_label'] = names[name].get(change['after'])
    results = []
    for entry, changes in zip(entries, shown):
        actor = entry.actor
        results.append({
            'id': entry.pk,
            'timestamp': entry.timestamp,
            'action': entry.action,
            'summary': entry.summary,
            'actor': (
                {'id': actor.pk, 'display_name': actor.get_full_name() or actor.get_username()}
                if actor
                else None
            ),
            'changes': changes,
        })
    return results
