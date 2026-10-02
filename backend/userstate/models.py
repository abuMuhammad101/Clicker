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
