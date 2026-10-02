import time

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from catalog.models import Product
from core.models import Contact, Country
from schema.engine import build_registry

User = get_user_model()


class AuthedTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('alice', password='x')
        self.other = User.objects.create_user('bob', password='x')
        self.client = APIClient()
        self.client.force_login(self.user)
        self.country = Country.objects.create(name='Testland', code='TL')
        self.contact = Contact.objects.create(name='Ada', type='person')
        self.product = Product.objects.create(name='Widget', sku='W-1')


class RegistryTests(AuthedTestCase):
    def test_every_exposed_model_appears_and_nothing_else(self):
        from django.apps import apps

        from schema.engine import is_exposed

        expected = {
            (model._meta.app_label, model._meta.model_name)
            for model in apps.get_models()
            if is_exposed(model)
        }
        listed = {
            (app['app_label'], entry['model'])
            for app in build_registry()
            for entry in app['models']
        }
        self.assertEqual(listed, expected)
        self.assertIn(('catalog', 'product'), listed)
        self.assertNotIn(('auth', 'user'), listed)

    def test_declared_icon_is_passed_through_and_missing_is_null(self):
        entries = {
            entry['model']: entry
            for app in build_registry()
            for entry in app['models']
        }
        self.assertEqual(entries['contact']['icon'], 'users')
        self.assertEqual(entries['product']['icon'], 'package')

        class NoIcon(Contact):
            class Meta:
                proxy = True
                app_label = 'core'

            class Schema:
                pass

        from schema.engine import _icon_name

        self.assertIsNone(_icon_name(NoIcon))

    def test_malformed_icon_names_are_dropped(self):
        from schema.engine import _icon_name

        for bad in ('Users', 'users icon', '../x', '', None, 42):
            model = type('M', (), {'Schema': type('Schema', (), {'icon': bad})})
            self.assertIsNone(_icon_name(model), bad)


class RecordViewTests(AuthedTestCase):
    def open_record(self, path):
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200)

    def test_opening_a_record_is_recorded_and_a_repeat_updates_in_place(self):
        self.open_record(f'/api/data/core/contact/{self.contact.pk}/')
        first = self.client.get('/api/recents/').json()['results']
        self.assertEqual([(r['model'], r['id']) for r in first], [('contact', self.contact.pk)])

        time.sleep(0.01)
        self.open_record(f'/api/data/core/contact/{self.contact.pk}/')
        again = self.client.get('/api/recents/').json()['results']
        self.assertEqual(len(again), 1)
        self.assertGreater(again[0]['viewed_at'], first[0]['viewed_at'])

        from userstate.models import RecordView

        self.assertEqual(RecordView.objects.filter(user=self.user).count(), 1)

    def test_most_recent_first_and_carries_what_the_home_shows(self):
        self.open_record(f'/api/data/core/contact/{self.contact.pk}/')
        time.sleep(0.01)
        self.open_record(f'/api/data/catalog/product/{self.product.pk}/')
        results = self.client.get('/api/recents/').json()['results']
        self.assertEqual([r['model'] for r in results], ['product', 'contact'])
        product = results[0]
        self.assertEqual(product['display'], 'Widget')
        self.assertEqual(product['model_label'], 'Product')
        self.assertEqual(product['app'], 'Catalog')
        self.assertEqual(product['app_label'], 'catalog')

    def test_views_are_per_user(self):
        self.open_record(f'/api/data/core/contact/{self.contact.pk}/')
        other = APIClient()
        other.force_login(self.other)
        self.assertEqual(other.get('/api/recents/').json()['results'], [])

    def test_a_record_that_no_longer_exists_drops_out(self):
        self.open_record(f'/api/data/core/country/{self.country.pk}/')
        Country.objects.filter(pk=self.country.pk).delete()
        self.assertEqual(self.client.get('/api/recents/').json()['results'], [])

    def test_a_missing_record_is_not_recorded(self):
        self.assertEqual(self.client.get('/api/data/core/contact/999999/').status_code, 404)
        self.assertEqual(self.client.get('/api/recents/').json()['results'], [])

    def test_list_and_schema_requests_are_not_views(self):
        self.client.get('/api/data/core/contact/')
        self.client.get('/api/schema/core/contact/')
        self.assertEqual(self.client.get('/api/recents/').json()['results'], [])

    def test_anonymous_gets_401(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get('/api/recents/').status_code, 401)
        self.assertEqual(anonymous.get('/api/preferences/sidebar.sections/').status_code, 401)


class PreferenceTests(AuthedTestCase):
    url = '/api/preferences/sidebar.sections/'

    def test_unset_is_null_and_a_put_round_trips(self):
        self.assertIsNone(self.client.get(self.url).json()['value'])
        response = self.client.put(self.url, {'value': {'collapsed': ['catalog']}}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(self.url).json()['value'], {'collapsed': ['catalog']})

    def test_a_second_put_replaces_not_duplicates(self):
        self.client.put(self.url, {'value': 1}, format='json')
        self.client.put(self.url, {'value': 2}, format='json')
        from userstate.models import UserPreference

        self.assertEqual(UserPreference.objects.filter(user=self.user).count(), 1)
        self.assertEqual(self.client.get(self.url).json()['value'], 2)

    def test_preferences_are_per_user(self):
        self.client.put(self.url, {'value': {'collapsed': ['core']}}, format='json')
        other = APIClient()
        other.force_login(self.other)
        self.assertIsNone(other.get(self.url).json()['value'])

    def test_bad_key_and_bad_body_are_400(self):
        self.assertEqual(self.client.get('/api/preferences/Not-Valid/').status_code, 400)
        self.assertEqual(self.client.put(self.url, {}, format='json').status_code, 400)
        huge = {'value': 'x' * 10_000}
        self.assertEqual(self.client.put(self.url, huge, format='json').status_code, 400)
