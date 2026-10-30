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
