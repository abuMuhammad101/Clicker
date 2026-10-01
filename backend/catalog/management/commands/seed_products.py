from decimal import Decimal

from django.core.management.base import BaseCommand

from catalog.models import Product
from core.models import Contact

PRODUCTS = [
    dict(name='Steel Hex Bolt M8x40', sku='HW-BOLT-M8-40', type=Product.TYPE_GOODS,
         description='Zinc-plated steel hex bolt, M8 thread, 40mm length.',
         sales_price=Decimal('0.45'), cost=Decimal('0.18'), barcode='4006381333931',
         weight=Decimal('0.02')),
    dict(name='Steel Hex Nut M8', sku='HW-NUT-M8', type=Product.TYPE_GOODS,
         description='Zinc-plated steel hex nut, M8 thread.',
         sales_price=Decimal('0.12'), cost=Decimal('0.04'), barcode='4006381333948',
         weight=Decimal('0.01')),
    dict(name='Corrugated Shipping Box, Medium', sku='PKG-BOX-M', type=Product.TYPE_GOODS,
         description='18x14x12in double-wall corrugated box.',
         sales_price=Decimal('2.10'), cost=Decimal('0.95'), barcode='4006381334013',
         weight=Decimal('0.35')),
    dict(name='Packing Tape, 48mm x 100m', sku='PKG-TAPE-48', type=Product.TYPE_GOODS,
         description='Clear acrylic packing tape, 48mm wide.',
         sales_price=Decimal('3.25'), cost=Decimal('1.40'), barcode='4006381334020',
         weight=Decimal('0.18')),
    dict(name='Industrial Caster Wheel 4in', sku='HW-CASTER-4', type=Product.TYPE_GOODS,
         description='Swivel caster wheel with brake, 4-inch, 150kg rated load.',
         sales_price=Decimal('14.50'), cost=Decimal('6.80'), barcode='4006381334037',
         weight=Decimal('0.62')),
    dict(name='Aluminium Extrusion Profile 20x20', sku='HW-EXT-2020', type=Product.TYPE_GOODS,
         description='T-slot aluminium extrusion, 20x20mm, sold per metre.',
         sales_price=Decimal('8.90'), cost=Decimal('4.10'), barcode='4006381334044',
         weight=Decimal('0.41')),
    dict(name='Warehouse Pallet, Standard', sku='PKG-PALLET-STD', type=Product.TYPE_GOODS,
         description='48x40in standard wooden shipping pallet.',
         sales_price=Decimal('18.00'), cost=Decimal('9.50'), barcode='4006381334051',
         weight=Decimal('22.00')),
    dict(name='Stretch Wrap Film 500mm', sku='PKG-WRAP-500', type=Product.TYPE_GOODS,
         description='Pre-stretch pallet wrap film, 500mm x 300m roll.',
         sales_price=Decimal('11.75'), cost=Decimal('5.60'), barcode='4006381334068',
         weight=Decimal('2.80')),
    dict(name='Safety Gloves, Cut-Resistant', sku='PPE-GLOVE-CUT5', type=Product.TYPE_GOODS,
         description='Cut level 5 safety gloves, per pair.',
         sales_price=Decimal('6.40'), cost=Decimal('2.90'), barcode='4006381334075',
         weight=Decimal('0.08')),
    dict(name='Freight Forwarding — LTL', sku='SVC-FREIGHT-LTL', type=Product.TYPE_SERVICE,
         description='Less-than-truckload freight forwarding, per shipment.',
         sales_price=Decimal('185.00'), cost=Decimal('140.00')),
    dict(name='Customs Clearance Filing', sku='SVC-CUSTOMS', type=Product.TYPE_SERVICE,
         description='Import customs documentation and clearance filing.',
         sales_price=Decimal('95.00'), cost=Decimal('60.00')),
    dict(name='Warehouse Storage, per Pallet/Month', sku='SVC-STORAGE-PM', type=Product.TYPE_SERVICE,
         description='Monthly pallet storage in a climate-controlled warehouse.',
         sales_price=Decimal('12.00'), cost=Decimal('5.50')),
    dict(name='Equipment Installation', sku='SVC-INSTALL', type=Product.TYPE_SERVICE,
         description='On-site installation and commissioning, per visit.',
         sales_price=Decimal('450.00'), cost=Decimal('300.00')),
    dict(name='Annual Maintenance Contract', sku='SVC-MAINT-ANNUAL', type=Product.TYPE_SERVICE,
         description='Preventive maintenance, four visits per year.',
         sales_price=Decimal('1200.00'), cost=Decimal('700.00')),
    dict(name='Rush Delivery Surcharge', sku='SVC-RUSH', type=Product.TYPE_SERVICE,
         description='Same-day dispatch surcharge, applied per order.',
         sales_price=Decimal('25.00'), cost=Decimal('0.00'), active=False),
]


class Command(BaseCommand):
    help = 'Seed Product records for local development.'

    def handle(self, *args, **options):
        vendors = list(Contact.objects.filter(is_vendor=True))
        if not vendors:
            self.stdout.write(self.style.WARNING(
                'No vendor contacts found — run core\'s `seed` command first. '
                'Products will be created without a supplier.'
            ))

        created = 0
        for index, data in enumerate(PRODUCTS):
            supplier = vendors[index % len(vendors)] if vendors else None
            _, was_created = Product.objects.get_or_create(
                sku=data['sku'],
                defaults={**data, 'supplier': supplier},
            )
            created += was_created

        total = Product.objects.count()
        self.stdout.write(self.style.SUCCESS(
            f'{created} products created, {total} total.'
        ))
