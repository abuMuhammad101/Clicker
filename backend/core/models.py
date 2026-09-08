from django.core.exceptions import ValidationError
from django.db import models


class Country(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=2, unique=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'countries'

    def save(self, *args, **kwargs):
        self.code = self.code.upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Contact(models.Model):
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
    )

    job_title = models.CharField(max_length=255, blank=True)
    tax_id = models.CharField(max_length=100, blank=True)

    active = models.BooleanField(default=True)

    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    mobile = models.CharField(max_length=50, blank=True)
    website = models.URLField(blank=True)

    street = models.CharField(max_length=255, blank=True)
    street2 = models.CharField(max_length=255, blank=True)
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

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['name']

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
