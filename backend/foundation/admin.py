from django.contrib import admin

from .models import AuditEntry


@admin.register(AuditEntry)
class AuditEntryAdmin(admin.ModelAdmin):
    """Read-only, for everyone, superusers included. History is not edited."""

    list_display = ['timestamp', 'actor_username', 'action', 'content_type', 'record_id', 'ip_address']
    list_filter = ['action', 'content_type']
    search_fields = ['actor_username', 'record_id']
    readonly_fields = [f.name for f in AuditEntry._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
