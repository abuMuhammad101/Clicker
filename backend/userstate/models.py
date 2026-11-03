from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils import timezone


class RecordView(models.Model):
    """
    "This user looked at this record, most recently at this time."

    One row per (user, record), updated in place on a repeat view — so it is a
    ranking of what someone has had open, not a log of every open. That shape
    is deliberate: it is what the Recents home needs, and it is the same data
    the open-records strip will need later (which records is this person
    currently juggling, most recent first). Any model can appear here without
    a foreign key to it, via the content type.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='record_views')
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveBigIntegerField()
    viewed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-viewed_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'content_type', 'object_id'], name='one_view_row_per_user_and_record'
            ),
        ]
        indexes = [models.Index(fields=['user', '-viewed_at'])]

    def __str__(self):
        return f'{self.user_id} viewed {self.content_type_id}:{self.object_id}'


class UserPreference(models.Model):
    """
    A small piece of UI state that belongs to a person, not a browser: which
    sidebar sections they've collapsed, for now. Keyed, with a JSON value, so
    the next preference is a new key rather than a new table.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='preferences')
    key = models.CharField(max_length=64)
    value = models.JSONField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'key'], name='one_preference_per_user_and_key'),
        ]

    def __str__(self):
        return f'{self.user_id}:{self.key}'


class SavedView(models.Model):
    """
    A list's state, saved under a name by one person: filters, sort, grouping
    (with which groups are collapsed), columns and density. Module views are
    declared in a model's Schema instead and never stored here.

    `state` is the shape `data.query.narrow_view` reads. A view is narrowed to
    the reader's fields every time it's served, so a shared view never shows
    anyone more than their own role allows.
    """

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='saved_views')
    app_label = models.CharField(max_length=100)
    model_name = models.CharField(max_length=100)
    label = models.CharField(max_length=80)
    state = models.JSONField()
    # Offered to everyone who can see the model, not just its owner.
    shared = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['label']
        constraints = [
            models.UniqueConstraint(
                fields=['owner', 'app_label', 'model_name', 'label'], name='one_view_name_per_owner_and_list'
            ),
        ]
        indexes = [models.Index(fields=['app_label', 'model_name'], name='savedview_list')]

    def __str__(self):
        return f'{self.app_label}.{self.model_name}: {self.label}'
