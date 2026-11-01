"""
Seed Product records: a Pakistani trading and services catalogue, priced in
rupees (the organisation's currency, settings.CLICKER_CURRENCY).

Re-running it brings every seeded product back to these values, matched by
SKU: prices, names and descriptions are updated in place, nothing is
deleted. A product's supplier is only chosen when the product is first
created, so a supplier someone set by hand survives a re-seed.

Every price has cost below sales price, so margin reads like a real one.
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.models import Product
from core.models import Contact


def _ean13(base12):
    """A valid EAN-13 from its first 12 digits (896 is Pakistan's GS1 prefix)."""
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(base12))
    return base12 + str((10 - total % 10) % 10)


def rs(amount):
    return Decimal(amount)


GOODS, SERVICE = Product.TYPE_GOODS, Product.TYPE_SERVICE

PRODUCTS = [
    # Office supplies and equipment
    dict(name='A4 Copy Paper 80gsm, Carton of 5 Reams', sku='OFF-PAPER-A4-CTN', type=GOODS,
         description='A4 80gsm copy paper, 500 sheets per ream, five reams per carton.',
         sales_price=rs('9500'), cost=rs('7650'), barcode=_ean13('896100000101'), weight=rs('12.50')),
    dict(name='Ergonomic Office Chair, Mesh Back', sku='OFF-CHAIR-MESH', type=GOODS,
         description='High-back mesh chair with lumbar support, adjustable arms and nylon base.',
         sales_price=rs('38000'), cost=rs('26500'), barcode=_ean13('896100000102'), weight=rs('14.00')),
    dict(name='Steel Filing Cabinet, 4 Drawer', sku='OFF-CABINET-4D', type=GOODS,
         description='Powder-coated steel filing cabinet, four lockable drawers, foolscap size.',
         sales_price=rs('52000'), cost=rs('36500'), barcode=_ean13('896100000103'), weight=rs('42.00')),
    dict(name='Laser Toner Cartridge, Black', sku='OFF-TONER-BK', type=GOODS,
         description='Compatible black toner cartridge, about 2,700 pages.',
         sales_price=rs('14500'), cost=rs('9800'), barcode=_ean13('896100000104'), weight=rs('0.90')),
    # Cooling and power
    dict(name='Inverter Split AC, 1.5 Ton', sku='HVAC-AC-INV-15', type=GOODS,
         description='DC inverter split air conditioner, 1.5 ton, heat and cool, with outdoor unit.',
         sales_price=rs('245000'), cost=rs('199000'), barcode=_ean13('896100000201'), weight=rs('38.00')),
    dict(name='UPS 1000VA, Line Interactive', sku='PWR-UPS-1000', type=GOODS,
         description='1000VA line-interactive UPS with AVR, for a desktop and monitor.',
         sales_price=rs('21500'), cost=rs('15800'), barcode=_ean13('896100000202'), weight=rs('7.20')),
    # Hardware and packaging (the original catalogue, repriced in rupees)
    dict(name='Steel Hex Bolt M8x40', sku='HW-BOLT-M8-40', type=GOODS,
         description='Zinc-plated steel hex bolt, M8 thread, 40mm length.',
         sales_price=rs('45'), cost=rs('22'), barcode='4006381333931', weight=rs('0.02')),
    dict(name='Steel Hex Nut M8', sku='HW-NUT-M8', type=GOODS,
         description='Zinc-plated steel hex nut, M8 thread.',
         sales_price=rs('12'), cost=rs('5'), barcode='4006381333948', weight=rs('0.01')),
    dict(name='Corrugated Shipping Box, Medium', sku='PKG-BOX-M', type=GOODS,
         description='18x14x12in double-wall corrugated box.',
         sales_price=rs('180'), cost=rs('95'), barcode='4006381334013', weight=rs('0.35')),
    dict(name='Packing Tape, 48mm x 100m', sku='PKG-TAPE-48', type=GOODS,
         description='Clear acrylic packing tape, 48mm wide.',
         sales_price=rs('320'), cost=rs('165'), barcode='4006381334020', weight=rs('0.18')),
    dict(name='Industrial Caster Wheel 4in', sku='HW-CASTER-4', type=GOODS,
         description='Swivel caster wheel with brake, 4-inch, 150kg rated load.',
         sales_price=rs('2450'), cost=rs('1350'), barcode='4006381334037', weight=rs('0.62')),
    dict(name='Aluminium Extrusion Profile 20x20', sku='HW-EXT-2020', type=GOODS,
         description='T-slot aluminium extrusion, 20x20mm, sold per metre.',
         sales_price=rs('1850'), cost=rs('1050'), barcode='4006381334044', weight=rs('0.41')),
    dict(name='Warehouse Pallet, Standard', sku='PKG-PALLET-STD', type=GOODS,
         description='48x40in standard wooden shipping pallet.',
         sales_price=rs('6500'), cost=rs('3900'), barcode='4006381334051', weight=rs('22.00')),
    dict(name='Stretch Wrap Film 500mm', sku='PKG-WRAP-500', type=GOODS,
         description='Pre-stretch pallet wrap film, 500mm x 300m roll.',
         sales_price=rs('3200'), cost=rs('1950'), barcode='4006381334068', weight=rs('2.80')),
    dict(name='Safety Gloves, Cut-Resistant', sku='PPE-GLOVE-CUT5', type=GOODS,
         description='Cut level 5 safety gloves, per pair.',
         sales_price=rs('950'), cost=rs('480'), barcode='4006381334075', weight=rs('0.08')),
    # Services
    dict(name='Freight Forwarding — LTL', sku='SVC-FREIGHT-LTL', type=SERVICE,
         description='Less-than-truckload freight forwarding, Karachi to Lahore, per shipment.',
         sales_price=rs('45000'), cost=rs('34000')),
    dict(name='Customs Clearance Filing', sku='SVC-CUSTOMS', type=SERVICE,
         description='Import goods declaration and clearance filing, per consignment.',
         sales_price=rs('25000'), cost=rs('15500')),
    dict(name='Warehouse Storage, per Pallet/Month', sku='SVC-STORAGE-PM', type=SERVICE,
         description='Monthly pallet storage in a covered warehouse.',
         sales_price=rs('2800'), cost=rs('1300')),
    dict(name='Equipment Installation', sku='SVC-INSTALL', type=SERVICE,
         description='On-site installation and commissioning, per visit.',
         sales_price=rs('18000'), cost=rs('11000')),
    dict(name='Annual Maintenance Contract', sku='SVC-MAINT-ANNUAL', type=SERVICE,
         description='Preventive maintenance, four visits per year.',
         sales_price=rs('180000'), cost=rs('105000')),
    dict(name='Rush Delivery Surcharge', sku='SVC-RUSH', type=SERVICE,
         description='Same-day dispatch surcharge, applied per order.',
         sales_price=rs('3500'), cost=rs('1200'), active=False),
]


class Command(BaseCommand):
    help = 'Seed Product records (prices in rupees). Re-running updates them by SKU.'

    @transaction.atomic
    def handle(self, *args, **options):
        vendors = list(Contact.objects.filter(is_vendor=True).order_by('pk'))
        if not vendors:
            self.stdout.write(self.style.WARNING(
                'No vendor contacts found — run core\'s `seed` command first. '
                'Products will be created without a supplier.'
            ))

        created = updated = 0
        for index, data in enumerate(PRODUCTS):
            fields = {'active': True, 'barcode': '', 'weight': None, **data}
            product = Product.objects.filter(sku=data['sku']).first()
            if product is None:
                supplier = vendors[index % len(vendors)] if vendors else None
                Product.objects.create(**fields, supplier=supplier)
                created += 1
                continue
            for name, value in fields.items():
                setattr(product, name, value)
            product.save()
            updated += 1

        self.stdout.write(self.style.SUCCESS(
            f'{created} products created, {updated} updated, {Product.objects.count()} total.'
        ))
