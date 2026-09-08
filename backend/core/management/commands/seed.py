from django.core.management.base import BaseCommand

from core.models import Contact, Country

COUNTRIES = [
    ('United States', 'US'),
    ('United Kingdom', 'GB'),
    ('Canada', 'CA'),
    ('Germany', 'DE'),
    ('France', 'FR'),
    ('Spain', 'ES'),
    ('Italy', 'IT'),
    ('Netherlands', 'NL'),
    ('Sweden', 'SE'),
    ('Switzerland', 'CH'),
    ('Ireland', 'IE'),
    ('Portugal', 'PT'),
    ('Poland', 'PL'),
    ('Japan', 'JP'),
    ('South Korea', 'KR'),
    ('Australia', 'AU'),
    ('New Zealand', 'NZ'),
    ('Singapore', 'SG'),
    ('United Arab Emirates', 'AE'),
    ('Brazil', 'BR'),
]


class Command(BaseCommand):
    help = 'Seed Country and Contact records for local development.'

    def handle(self, *args, **options):
        countries = {}
        for name, code in COUNTRIES:
            country, _ = Country.objects.get_or_create(code=code, defaults={'name': name})
            countries[code] = country
        self.stdout.write(self.style.SUCCESS(f'{len(countries)} countries ready.'))

        acme, _ = Contact.objects.get_or_create(
            name='Acme Corporation',
            type=Contact.TYPE_COMPANY,
            defaults=dict(
                tax_id='US-84-1234567',
                website='https://acme.example.com',
                email='hello@acme.example.com',
                phone='+1 415 555 0100',
                street='500 Market St',
                city='San Francisco',
                state='CA',
                zip='94105',
                country=countries['US'],
                is_customer=True,
            ),
        )
        Contact.objects.get_or_create(
            name='Jordan Lee',
            type=Contact.TYPE_PERSON,
            parent=acme,
            defaults=dict(
                job_title='VP of Operations',
                email='jordan.lee@acme.example.com',
                phone='+1 415 555 0101',
                mobile='+1 415 555 0192',
            ),
        )
        Contact.objects.get_or_create(
            name='Priya Shah',
            type=Contact.TYPE_PERSON,
            parent=acme,
            defaults=dict(
                job_title='Finance Director',
                email='priya.shah@acme.example.com',
                phone='+1 415 555 0103',
            ),
        )

        globex, _ = Contact.objects.get_or_create(
            name='Globex Industries',
            type=Contact.TYPE_COMPANY,
            defaults=dict(
                tax_id='GB-998877665',
                website='https://globex.example.co.uk',
                email='contact@globex.example.co.uk',
                phone='+44 20 7946 0100',
                street='1 King William St',
                city='London',
                zip='EC4N 7AF',
                country=countries['GB'],
                is_vendor=True,
            ),
        )
        Contact.objects.get_or_create(
            name='Emma Whitfield',
            type=Contact.TYPE_PERSON,
            parent=globex,
            defaults=dict(
                job_title='Procurement Lead',
                email='emma.whitfield@globex.example.co.uk',
                phone='+44 20 7946 0101',
            ),
        )

        Contact.objects.get_or_create(
            name='Nadia Petrova',
            type=Contact.TYPE_PERSON,
            defaults=dict(
                email='nadia.petrova@example.com',
                phone='+49 30 5550 1234',
                city='Berlin',
                country=countries['DE'],
                is_customer=True,
            ),
        )
        Contact.objects.get_or_create(
            name='Kenji Watanabe',
            type=Contact.TYPE_PERSON,
            defaults=dict(
                email='kenji.watanabe@example.jp',
                phone='+81 3 5550 0123',
                city='Tokyo',
                country=countries['JP'],
            ),
        )
        Contact.objects.get_or_create(
            name='Sofia Almeida',
            type=Contact.TYPE_PERSON,
            defaults=dict(
                email='sofia.almeida@example.pt',
                mobile='+351 91 234 5678',
                city='Lisbon',
                country=countries['PT'],
                is_vendor=True,
            ),
        )

        northwind, _ = Contact.objects.get_or_create(
            name='Northwind Traders',
            type=Contact.TYPE_COMPANY,
            defaults=dict(
                tax_id='CA-887766554',
                website='https://northwind.example.ca',
                city='Toronto',
                country=countries['CA'],
                active=False,
            ),
        )
        Contact.objects.get_or_create(
            name='Marcus Bellweather',
            type=Contact.TYPE_PERSON,
            defaults=dict(
                email='marcus.bellweather@example.com',
                phone='+61 2 5550 0110',
                city='Sydney',
                country=countries['AU'],
                is_customer=True,
            ),
        )

        total = Contact.objects.count()
        self.stdout.write(self.style.SUCCESS(f'{total} contacts ready (including {northwind.name}, archived).'))
