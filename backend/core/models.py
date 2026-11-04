from decimal import Decimal

from django.core.exceptions import ValidationError
from django.contrib.postgres.indexes import GinIndex, OpClass
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models.functions import Upper

from django.conf import settings

from billing.expressions import customer_advance, customer_oldest_overdue_days, customer_outstanding
from foundation.models import ClickerModel
from foundation.rules import USER


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
        default_grants = {
            'Clerk': ['view_country'],
            'Billing officer': ['view_country'],
            'Cashier': ['view_country'],
            'Recovery officer': ['view_country'],
        }
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
        # What the Schema below sorts, filters, groups and searches by
        # (foreign keys carry their own index).
        indexes = [
            models.Index(fields=['name'], name='contact_name'),
            models.Index(fields=['type'], name='contact_type'),
            models.Index(fields=['active'], name='contact_active'),
            models.Index(fields=['is_customer'], name='contact_is_customer'),
            models.Index(fields=['customer_since'], name='contact_customer_since'),
            GinIndex(OpClass(Upper('name'), name='gin_trgm_ops'), name='contact_name_trgm'),
            GinIndex(OpClass(Upper('email'), name='gin_trgm_ops'), name='contact_email_trgm'),
            GinIndex(OpClass(Upper('phone'), name='gin_trgm_ops'), name='contact_phone_trgm'),
            GinIndex(OpClass(Upper('tax_id'), name='gin_trgm_ops'), name='contact_tax_id_trgm'),
        ]

    class Schema:
        icon = 'users'
        display_field = 'display_name'

        # Readable and writable only with their own grant, on top of the
        # model's: view_ (read), add_ (set on create only, write-once) and
        # change_ (write any time), e.g. core.add_contact_tax_id. The three
        # permissions are created automatically after migrate.
        # `active` is restricted because changing it is archiving.
        restricted_fields = ['tax_id', 'active', 'credit_limit']
        # Archived contacts leave lists and pickers; history keeps pointing at them.
        archive_field = 'active'

        # What each role may do here (Managers may do everything). A Clerk
        # creates contacts and keeps them current, but can't archive one or
        # change its credit limit; they read all three. A Clerk adding a
        # company enters its tax ID, and only a Manager can change it after.
        default_grants = {
            'Clerk': [
                'view_contact',
                'add_contact',
                'change_contact',
                'view_contact_tax_id',
                'add_contact_tax_id',
                'view_contact_active',
                'view_contact_credit_limit',
            ],
            # A Billing officer keeps consumers current and sets a tax ID on a new one.
            'Billing officer': [
                'view_contact',
                'add_contact',
                'change_contact',
                'view_contact_tax_id',
                'add_contact_tax_id',
                'view_contact_active',
                'view_contact_credit_limit',
            ],
            'Cashier': ['view_contact'],
            'Recovery officer': ['view_contact'],
        }

        # A Recovery officer sees only the consumers whose case they own.
        record_rules = [{'role': 'Recovery officer', 'filter': {'recovery_cases__owner__user_id': USER}}]

        # What a customer owes, from their bills, in the database: it sorts,
        # filters and sums like a column, and only someone who may view the
        # bills sees it.
        computed = {
            'outstanding': {
                'label': 'Outstanding',
                'type': 'currency',
                'description': 'Everything this customer owes on posted bills',
                'expression': customer_outstanding('pk'),
                'requires': ['billing.bill'],
            },
            'oldest_overdue_days': {
                'label': 'Oldest overdue (days)',
                'type': 'integer',
                'description': 'Days since the oldest unpaid bill fell due',
                'expression': customer_oldest_overdue_days('pk'),
                'requires': ['billing.bill'],
            },
            'advance': {
                'label': 'Advance held',
                'type': 'currency',
                'description': 'Payments received that are not yet applied to any bill',
                'expression': customer_advance('pk'),
                'requires': ['billing.paymentallocation'],
            },
        }

        # Order here is form layout, not Django's declaration order — group
        # order and field order within a group are both explicit, on purpose.
        groups = [
            {'label': 'Identity', 'fields': ['name', 'type', 'parent', 'job_title', 'tax_id']},
            # Right under the name: for a customer, this form is their statement.
            {'label': 'Account', 'fields': ['outstanding', 'oldest_overdue_days', 'advance']},
            {
                'label': 'Commercial',
                'fields': ['is_customer', 'is_vendor', 'customer_since', 'payment_terms_days', 'credit_limit'],
            },
            {'label': 'Communication', 'fields': ['email', 'phone', 'mobile', 'website']},
            {'label': 'Address', 'fields': ['street', 'street2', 'city', 'state', 'zip', 'country']},
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
            # The statement: what was billed, what was paid, what was reduced.
            {
                'relation': 'bills',
                'label': 'Bills',
                'columns': ['number', 'issue_date', 'due_date', 'amount_total', 'balance', 'payment_status'],
            },
            {
                'relation': 'payments',
                'label': 'Payments',
                'columns': ['number', 'payment_date', 'method', 'reference', 'amount', 'advance'],
            },
            {'relation': 'adjustments', 'label': 'Adjustments', 'columns': ['number', 'kind', 'amount', 'state']},
            {
                'relation': 'connections',
                'label': 'Connections',
                'columns': ['number', 'district', 'billing_basis', 'status'],
            },
            {
                'relation': 'recovery_cases',
                'label': 'Recovery cases',
                'columns': ['number', 'state', 'owner', 'next_action_date'],
            },
        ]

        list_display = ['name', 'type', 'email', 'phone', 'city', 'country']
        list_sort = [{'field': 'name', 'direction': 'asc'}]
        list_filter_defaults = {'active': True}
        search_fields = ['name', 'email', 'phone', 'tax_id']
        summaries = [
            {'label': 'Contacts', 'aggregate': 'count'},
            {'label': 'Customers', 'aggregate': 'count', 'filter': ['is_customer:is:true']},
            {'label': 'Credit extended', 'aggregate': 'sum', 'field': 'credit_limit', 'filter': ['is_customer:is:true']},
        ]
        views = [
            {'key': 'customers', 'label': 'Customers', 'filters': ['is_customer:is:true']},
            {'key': 'companies', 'label': 'Companies', 'filters': ['type:in:company']},
            {'key': 'by_country', 'label': 'By country', 'group_by': 'country'},
            {
                'key': 'owing',
                'label': 'Owing money',
                'filters': ['is_customer:is:true', 'outstanding:gte:0.01'],
                'ordering': '-outstanding',
                'columns': ['name', 'type', 'outstanding', 'oldest_overdue_days', 'country'],
            },
        ]

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


class Staff(ClickerModel):
    """
    A person who works here, as records see them: the account officer on a
    connection, the owner of a recovery case. Linked to the one user they sign
    in as (the link is server-owned: the team page, not a form, makes it), so
    a record names a person and never a username. Shared by every journey.
    """

    display_name = models.CharField(max_length=150)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        editable=False,
        on_delete=models.PROTECT,
        related_name='staff',
    )
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ['display_name']
        verbose_name = 'staff member'
        verbose_name_plural = 'staff'

    class Schema:
        icon = 'id-card'
        display_field = 'display_name'
        archive_field = 'active'
        list_display = ['display_name', 'active']
        list_sort = [{'field': 'display_name', 'direction': 'asc'}]
        search_fields = ['display_name']
        default_grants = {
            'Clerk': ['view_staff'],
            'Billing officer': ['view_staff'],
            'Cashier': ['view_staff'],
            'Recovery officer': ['view_staff'],
        }

    def __str__(self):
        return self.display_name
