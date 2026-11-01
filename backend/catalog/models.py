from django.db import models
from django.db.models import F

from core.models import Contact
from foundation.models import ClickerModel


class Product(ClickerModel):
    TYPE_GOODS = 'goods'
    TYPE_SERVICE = 'service'
    TYPE_CHOICES = [
        (TYPE_GOODS, 'Goods'),
        (TYPE_SERVICE, 'Service'),
    ]

    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=64, unique=True, verbose_name='SKU')
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default=TYPE_GOODS)
    description = models.TextField(blank=True)
    sales_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    active = models.BooleanField(default=True)

    # Cross-app FK, deliberately: Contact and Country live in `core`,
    # Product lives in `catalog`. The schema engine doesn't care — a
    # many_to_one's target is just {app_label, model}, derived the same way
    # regardless of which app it points at.
    supplier = models.ForeignKey(
        Contact,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='supplied_products',
    )

    barcode = models.CharField(max_length=64, blank=True)
    weight = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    class Meta:
        ordering = ['name']

    class Schema:
        icon = 'package'
        display_field = 'name'
        archive_field = 'active'

        groups = [
            {'label': 'Identity', 'fields': ['name', 'sku', 'type', 'description']},
            {'label': 'Pricing', 'fields': ['sales_price', 'cost', 'margin']},
            {'label': 'Logistics', 'fields': ['barcode', 'weight']},
            {'label': 'Classification', 'fields': ['active', 'supplier']},
        ]

        list_display = ['name', 'sku', 'type', 'sales_price', 'margin', 'supplier', 'active']

        # Money, in the organisation's currency (settings.CLICKER_CURRENCY).
        field_types = {'sales_price': 'currency', 'cost': 'currency'}

        # Calculated in the database, never stored: sortable, filterable and
        # summable like a column. Read-only for everyone; hidden from anyone
        # who can't read every field it's made from.
        computed = {
            'margin': {'label': 'Margin', 'type': 'currency', 'expression': F('sales_price') - F('cost')},
        }
        list_sort = [{'field': 'name', 'direction': 'asc'}]
        search_fields = ['name', 'sku', 'barcode']

        # Restricts the supplier picker to vendors only — same pattern as
        # Contact.Schema's parent-must-be-company domain, just on a boolean
        # field instead of a selection, which is what surfaced the
        # string-vs-bool coercion bug fixed in data/views.py.
        domains = {
            'supplier': {'is_vendor': True},
        }

    def __str__(self):
        return self.name
