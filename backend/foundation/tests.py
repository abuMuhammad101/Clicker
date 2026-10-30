from django.test import SimpleTestCase

from catalog.models import Product
from core.models import Contact, Country
from foundation.models import ClickerModel
from schema.engine import build_schema


class BaseModelTests(SimpleTestCase):
    def test_every_exposed_model_stands_on_the_base_model(self):
        for model in (Contact, Country, Product):
            self.assertTrue(issubclass(model, ClickerModel), model)

    def test_server_owned_fields_are_not_editable(self):
        for name in ClickerModel.SERVER_OWNED_FIELDS:
            self.assertFalse(Contact._meta.get_field(name).editable, name)

    def test_server_owned_fields_never_reach_a_schema(self):
        fields = build_schema(Contact)['fields']
        for name in ClickerModel.SERVER_OWNED_FIELDS:
            self.assertNotIn(name, fields)
