from django.contrib import admin

from .models import Contact, Country


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = ['name', 'code']
    search_fields = ['name', 'code']
    ordering = ['name']


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ['name', 'type', 'email', 'phone', 'city', 'country', 'active']
    list_filter = ['type', 'active', 'is_customer', 'is_vendor', 'country']
    search_fields = ['name', 'email', 'phone', 'tax_id']
    ordering = ['name']
    autocomplete_fields = ['parent', 'country']

    fieldsets = [
        (None, {'fields': ['name', 'type', 'parent', 'active']}),
        ('Person', {'fields': ['job_title']}),
        ('Company', {'fields': ['tax_id', 'website']}),
        ('Contact info', {'fields': ['email', 'phone', 'mobile']}),
        ('Address', {'fields': ['street', 'street2', 'city', 'state', 'zip', 'country']}),
        ('Relationship', {'fields': ['is_customer', 'is_vendor']}),
        ('Notes', {'fields': ['notes']}),
    ]
