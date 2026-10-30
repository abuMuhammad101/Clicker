from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from foundation.models import ClickerModel


class Country(ClickerModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=2, unique=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'countries'

    class Schema:
        icon = 'globe'
        display_field = 'name'
        # Countries are seeded reference data: a Clerk reads them (a contact's
        # country) and changes nothing.
        default_grants = {'Clerk': ['view_country']}
        list_display = ['name', 'code']
        list_sort = [{'field': 'name', 'direction': 'asc'}]
        search_fields = ['name', 'code']

    def save(self, *args, **kwargs):
        self.code = self.code.upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Contact(ClickerModel):
    TYPE_PERSON = 'person'
    TYPE_COMPANY = 'company'
    TYPE_CHOICES = [
        (TYPE_PERSON, 'Person'),
        (TYPE_COMPANY, 'Company'),
    ]

    name = models.CharField(max_length=255)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default=TYPE_PERSON)

    # PROTECT: a company with people under it, or a person with dependent
    # records, can't be deleted out from under them. Archive via `active`
    # instead — this is the "restricted when referenced" rule from the spec.
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='children',
        help_text='Must be a company. Leave blank for a standalone contact.',
    )

    job_title = models.CharField(max_length=255, blank=True)
    tax_id = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='tax ID',
        help_text='VAT number, EIN, or local tax identifier — format varies by country.',
    )

    active = models.BooleanField(default=True)

    email = models.EmailField(blank=True)
    # Format hints live in help_text, not in placeholders: a placeholder that
    # looks like a phone number reads as a stored value at a glance.
    phone = models.CharField(
        max_length=50,
        blank=True,
        help_text='International format: + and the country code, then the number.',
    )
    mobile = models.CharField(
        max_length=50,
        blank=True,
        help_text='International format: + and the country code, then the number.',
    )
    website = models.URLField(blank=True, help_text='Full address, starting with https://')

    street = models.CharField(max_length=255, blank=True)
    street2 = models.CharField(max_length=255, blank=True, verbose_name='street 2')
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    zip = models.CharField(max_length=20, blank=True)
    country = models.ForeignKey(
        Country,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='contacts',
    )

    is_customer = models.BooleanField(default=False)
    is_vendor = models.BooleanField(default=False)

    # Commercial terms, ahead of invoicing (S-5). db_default on the integer so a
    # machine still on older code can insert contacts while the other has
    # migrated.
    payment_terms_days = models.PositiveIntegerField(
        default=30,
        db_default=30,
        validators=[MaxValueValidator(365)],
        verbose_name='payment terms (days)',
        help_text='Days a customer has to pay an invoice.',
    )
    credit_limit = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0'))],
        help_text='Leave blank for no limit.',
    )
    customer_since = models.DateField(null=True, blank=True)

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['name']

    class Schema:
        icon = 'users'
        display_field = 'display_name'

        # Readable and writable only with their own grant, on top of the
        # model's: core.view_contact_tax_id and core.change_contact_tax_id.
        # The two permissions are created automatically after migrate.
        # `active` is restricted because changing it is archiving.
        restricted_fields = ['tax_id', 'active', 'credit_limit']

        # What each role may do here (Managers may do everything). A Clerk
        # creates contacts and keeps them current, but can't archive one or
        # change its tax ID or credit limit; they read all three.
        default_grants = {
            'Clerk': [
                'view_contact',
                'add_contact',
                'change_contact',
                'view_contact_tax_id',
                'view_contact_active',
                'view_contact_credit_limit',
            ],
        }

        # Order here is form layout, not Django's declaration order — group
        # order and field order within a group are both explicit, on purpose.
        groups = [
            {'label': 'Identity', 'fields': ['name', 'type', 'parent', 'job_title', 'tax_id']},
            {'label': 'Communication', 'fields': ['email', 'phone', 'mobile', 'website']},
            {'label': 'Address', 'fields': ['street', 'street2', 'city', 'state', 'zip', 'country']},
            {
                'label': 'Commercial',
                'fields': ['is_customer', 'is_vendor', 'customer_since', 'payment_terms_days', 'credit_limit'],
            },
            {'label': 'Classification', 'fields': ['active', 'notes']},
        ]

        # Shown under the form, in this order: the reverse relations a person
        # reading this record wants next to it. Opt-in; `relation` is the
        # related_name, `columns` the target's own fields.
        related_lists = [
            {'relation': 'children', 'label': 'People', 'columns': ['name', 'job_title', 'email', 'phone']},
            {
                'relation': 'supplied_products',
                'label': 'Products supplied',
                'columns': ['name', 'sku', 'sales_price', 'active'],
            },
        ]

        list_display = ['name', 'type', 'email', 'phone', 'city', 'country']
        list_sort = [{'field': 'name', 'direction': 'asc'}]
        list_filter_defaults = {'active': True}
        search_fields = ['name', 'email', 'phone', 'tax_id']

        # Django has no distinct field class for these — CharField is all it
        # sees. The registry type has to be stated explicitly.
        field_types = {
            'phone': 'phone',
            'mobile': 'phone',
            'credit_limit': 'currency',
        }

        # Single equality condition is all the spec needs today. If a future
        # module needs AND/OR, extend this shape — don't bolt a second one on.
        # Nested class bodies can't see Contact's class attributes (Python
        # class scoping doesn't nest), so these repeat the literal values of
        # TYPE_PERSON / TYPE_COMPANY rather than referencing them.
        visible_when = {
            'job_title': {'field': 'type', 'equals': 'person'},
            'tax_id': {'field': 'type', 'equals': 'company'},
            'website': {'field': 'type', 'equals': 'company'},
        }

        # Restricts the `parent` picker to companies — mirrors the same rule
        # Contact.clean() enforces server-side; this just lets the UI filter
        # candidates before the user picks one that would fail validation.
        domains = {
            'parent': {'type': 'company'},
        }

    def clean(self):
        if self.parent_id is not None:
            if self.pk is not None and self.parent_id == self.pk:
                raise ValidationError({'parent': 'A contact cannot be its own parent.'})

            if self.parent.type != self.TYPE_COMPANY:
                raise ValidationError({'parent': 'Parent must be a company.'})

            # Walk up the chain looking for a cycle back to this record.
            ancestor = self.parent
            seen = {self.pk} if self.pk is not None else set()
            while ancestor is not None:
                if ancestor.pk in seen:
                    raise ValidationError({'parent': 'This would create a circular hierarchy.'})
                seen.add(ancestor.pk)
                ancestor = ancestor.parent

    @property
    def display_name(self):
        if self.type == self.TYPE_COMPANY:
            return self.name
        if self.parent_id:
            return f'{self.name} ({self.parent.name})'
        return self.name

    def __str__(self):
        return self.display_name
