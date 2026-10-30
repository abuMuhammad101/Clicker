from django.conf import settings
from django.db import models
from django.utils import timezone


class ClickerModel(models.Model):
    """
    The base for every model a module exposes.

    The four audit fields are server-owned: `editable=False` keeps them out of
    every writable set (the API rejects them by name), and the data layer
    fills them in from the acting user. A client can never set or change who
    created or last changed a record, or when.

    A user who created or changed records is protected from deletion
    (PROTECT): deactivate them instead, so history keeps a name.
    """

    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        editable=False,
        on_delete=models.PROTECT,
        related_name='+',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        editable=False,
        on_delete=models.PROTECT,
        related_name='+',
    )

    # The fields the data layer owns. Nothing outside it may write them.
    SERVER_OWNED_FIELDS = ('created_at', 'updated_at', 'created_by', 'updated_by')

    class Meta:
        abstract = True


class AppendOnlyError(Exception):
    """Raised on any attempt to change or remove an audit entry."""


class AuditEntryQuerySet(models.QuerySet):
    """No bulk path changes or removes an entry either."""

    def update(self, **kwargs):
        raise AppendOnlyError('Audit entries are append-only.')

    def delete(self):
        raise AppendOnlyError('Audit entries are append-only.')

    def bulk_update(self, objs, fields, batch_size=None):
        raise AppendOnlyError('Audit entries are append-only.')


class AuditEntry(models.Model):
    """
    One write to one record: who, when, from where, and each changed field's
    value before and after. Written by the data layer in the same database
    transaction as the change, so a change without its entry can't exist.

    Append-only at three levels: this model refuses save() on an existing
    row and delete(), its queryset refuses update()/delete(), and on Postgres
    a trigger refuses UPDATE and DELETE outright (migration 0002). Django
    admin shows it read-only. Nobody, managers included, edits history.

    A user who appears here can't be deleted (PROTECT): deactivate them.
    """

    ACTION_CREATE = 'create'
    ACTION_UPDATE = 'update'
    ACTION_CHOICES = [(ACTION_CREATE, 'Created'), (ACTION_UPDATE, 'Updated')]

    timestamp = models.DateTimeField(default=timezone.now, editable=False, db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.PROTECT,
        related_name='+',
        editable=False,
    )
    # The name at the time, so the entry still reads correctly if the
    # account is later renamed.
    actor_username = models.CharField(max_length=150, editable=False)
    ip_address = models.GenericIPAddressField(null=True, blank=True, editable=False)
    content_type = models.ForeignKey(
        'contenttypes.ContentType', on_delete=models.PROTECT, related_name='+', editable=False
    )
    record_id = models.CharField(max_length=64, editable=False)
    action = models.CharField(max_length=16, choices=ACTION_CHOICES, editable=False)
    # {field_name: {"before": value, "after": value}}; before is null on create.
    changes = models.JSONField(default=dict, editable=False)

    objects = AuditEntryQuerySet.as_manager()

    class Meta:
        ordering = ['-timestamp', '-id']
        indexes = [models.Index(fields=['content_type', 'record_id', '-timestamp'], name='audit_record_idx')]
        verbose_name_plural = 'audit entries'

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise AppendOnlyError('Audit entries are append-only.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AppendOnlyError('Audit entries are append-only.')

    def __str__(self):
        return f'{self.actor_username} {self.action} {self.content_type.model} #{self.record_id}'
