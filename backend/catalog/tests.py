from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from catalog.management.commands.seed_products import PRODUCTS, _ean13
from catalog.models import Product


def seed():
    call_command('seed_products', stdout=StringIO())


class SeedProductsTests(TestCase):
    def test_prices_are_in_rupees_with_cost_below_price(self):
        seed()
        for product in Product.objects.all():
            self.assertGreaterEqual(product.sales_price, Decimal('10'), product.sku)
            self.assertLess(product.cost, product.sales_price, product.sku)
        self.assertEqual(Product.objects.get(sku='OFF-PAPER-A4-CTN').sales_price, Decimal('9500'))
        self.assertEqual(Product.objects.get(sku='OFF-CHAIR-MESH').sales_price, Decimal('38000'))
        self.assertEqual(Product.objects.get(sku='HVAC-AC-INV-15').sales_price, Decimal('245000'))

    def test_rerunning_reprices_an_existing_dollar_product_in_place(self):
        old = Product.objects.create(sku='HW-CASTER-4', name='Industrial Caster Wheel 4in', sales_price=Decimal('14.50'), cost=Decimal('6.80'))
        seed()
        old.refresh_from_db()
        self.assertEqual(old.sales_price, Decimal('2450'))
        self.assertEqual(old.cost, Decimal('1350'))
        self.assertEqual(Product.objects.filter(sku='HW-CASTER-4').count(), 1)

    def test_rerunning_is_idempotent(self):
        seed()
        seed()
        self.assertEqual(Product.objects.count(), len(PRODUCTS))

    def test_new_barcodes_are_valid_ean13(self):
        for product in PRODUCTS:
            code = product.get('barcode')
            if code and code.startswith('896'):
                self.assertEqual(_ean13(code[:12]), code)
