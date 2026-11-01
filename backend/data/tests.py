"""
The enforcement point and permissions through the schema. Every rule here has
a test that proves it denies, not only one that proves it allows.
"""
import re
from pathlib import Path

from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from catalog.models import Product
from core.models import Contact, Country
from foundation.testing import grant_everything, make_user
from schema.engine import build_registry, build_schema

BACKEND = Path(__file__).resolve().parent.parent


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


class Fixtures(TestCase):
    def setUp(self):
        self.country = Country.objects.create(name='Pakistan', code='PK')
        self.company = Contact.objects.create(
            name='Indus Traders', type='company', tax_id='NTN-1234567', country=self.country
        )
        self.product = Product.objects.create(name='Widget', sku='W-1')


class NoGrantsTests(Fixtures):
    """A signed-in user with no grants sees nothing at all, as 404s."""

    def setUp(self):
        super().setUp()
        self.client = client_for(make_user('nobody'))

    def test_every_data_path_is_404(self):
        pk = self.company.pk
        for method, path in [
            ('get', '/api/data/core/contact/'),
            ('get', f'/api/data/core/contact/{pk}/'),
            ('get', '/api/data/core/contact/search/?q=indus'),
            ('get', '/api/schema/core/contact/'),
            ('post', '/api/data/core/contact/'),
            ('patch', f'/api/data/core/contact/{pk}/'),
        ]:
            response = getattr(self.client, method)(path, {}, format='json')
            self.assertEqual(response.status_code, 404, f'{method} {path}')

    def test_registry_is_empty(self):
        self.assertEqual(self.client.get('/api/registry/').json()['apps'], [])

    def test_a_missing_and_a_forbidden_record_look_the_same(self):
        missing = self.client.get('/api/data/core/contact/999999/')
        forbidden = self.client.get(f'/api/data/core/contact/{self.company.pk}/')
        self.assertEqual(missing.status_code, forbidden.status_code)
        self.assertEqual(missing.json(), forbidden.json())


class ModelPermissionTests(Fixtures):
    def test_view_only_can_read_but_writes_are_403(self):
        client = client_for(make_user('viewer', 'core.view_contact'))
        self.assertEqual(client.get('/api/data/core/contact/').status_code, 200)
        self.assertEqual(client.get(f'/api/data/core/contact/{self.company.pk}/').status_code, 200)
        patch = client.patch(f'/api/data/core/contact/{self.company.pk}/', {'name': 'X'}, format='json')
        self.assertEqual(patch.status_code, 403)
        post = client.post('/api/data/core/contact/', {'name': 'New'}, format='json')
        self.assertEqual(post.status_code, 403)
        self.company.refresh_from_db()
        self.assertEqual(self.company.name, 'Indus Traders')

    def test_schema_actions_follow_the_grants(self):
        user = make_user('viewer', 'core.view_contact', 'core.change_contact')
        actions = build_schema(Contact, user)['actions']
        # No archive: changing `active` needs its own field grant.
        self.assertEqual(actions, {'view': True, 'create': False, 'update': True, 'archive': False, 'delete': False})

    def test_registry_lists_only_viewable_models(self):
        user = make_user('viewer', 'core.view_contact')
        listed = {(a['app_label'], m['model']) for a in build_registry(user) for m in a['models']}
        self.assertEqual(listed, {('core', 'contact')})

    def test_another_models_grant_opens_nothing_here(self):
        client = client_for(make_user('products-only', 'catalog.view_product'))
        self.assertEqual(client.get('/api/data/core/contact/').status_code, 404)
        self.assertEqual(client.get('/api/data/catalog/product/').status_code, 200)

    def test_inactive_user_has_no_access(self):
        user = make_user('gone', 'core.view_contact')
        user.is_active = False
        user.save()
        self.assertIsNone(build_schema(Contact, user))


class FieldPermissionTests(Fixtures):
    def test_restricted_field_is_hidden_without_its_grant(self):
        user = make_user('clerkish', 'core.view_contact', 'core.change_contact', 'core.view_country')
        schema = build_schema(Contact, user)
        self.assertNotIn('tax_id', schema['fields'])
        self.assertNotIn('tax_id', schema['list']['search_fields'])
        self.assertNotIn('tax_id', [f for g in schema['groups'] for f in g['fields']])

        client = client_for(user)
        record = client.get(f'/api/data/core/contact/{self.company.pk}/').json()
        self.assertNotIn('tax_id', record['values'])
        listed = client.get('/api/data/core/contact/').json()['results']
        self.assertTrue(all('tax_id' not in row['values'] for row in listed))

    def test_searching_a_hidden_field_finds_nothing(self):
        client = client_for(make_user('clerkish', 'core.view_contact'))
        self.assertEqual(client.get('/api/data/core/contact/?q=NTN-1234567').json()['count'], 0)
        self.assertEqual(client.get('/api/data/core/contact/search/?q=NTN-1234567').json(), [])

    def test_read_grant_without_write_grant_is_read_only(self):
        user = make_user(
            'clerkish', 'core.view_contact', 'core.change_contact', 'core.view_contact_tax_id'
        )
        field = build_schema(Contact, user)['fields']['tax_id']
        self.assertTrue(field['read_only'])
        name = build_schema(Contact, user)['fields']['name']
        self.assertFalse(name['read_only'])

    def test_both_field_grants_make_it_writable(self):
        user = make_user(
            'manager-ish',
            'core.view_contact',
            'core.change_contact',
            'core.view_contact_tax_id',
            'core.change_contact_tax_id',
        )
        self.assertFalse(build_schema(Contact, user)['fields']['tax_id']['read_only'])

    def test_a_relation_to_an_unviewable_model_keeps_its_id_but_not_its_label(self):
        user = make_user('no-countries', 'core.view_contact', 'core.change_contact')
        field = build_schema(Contact, user)['fields']['country']
        self.assertTrue(field['read_only'])  # can't link to what they can't see
        record = client_for(user).get(f'/api/data/core/contact/{self.company.pk}/').json()
        self.assertEqual(record['values']['country'], self.country.pk)
        self.assertIsNone(record['labels']['country'])
        self.assertEqual(record['restricted'], {'country': True})

    def test_server_owned_fields_are_never_writable_even_for_everything(self):
        user = grant_everything(make_user('manager'))
        fields = build_schema(Contact, user)['fields']
        self.assertTrue(fields['id']['read_only'])
        for name in ('created_at', 'updated_at', 'created_by', 'updated_by'):
            self.assertNotIn(name, fields)


class RecentsScopeTests(Fixtures):
    def test_a_record_the_user_can_no_longer_see_drops_out_of_recents(self):
        from userstate.services import record_view

        user = make_user('formerly', 'core.view_contact')
        record_view(user, self.product)  # viewed back when they had access
        self.assertEqual(client_for(user).get('/api/recents/').json()['results'], [])


class OneEnforcementPointTests(SimpleTestCase):
    """
    No view may build a queryset for an exposed model except through
    data.access. A crude source check, but it fails loudly the moment
    someone reaches for Model.objects in a view.
    """

    VIEW_FILES = ['data/views.py', 'schema/views.py', 'userstate/views.py', 'accounts/views.py']

    def test_no_view_touches_a_models_manager_directly(self):
        pattern = re.compile(r'\b(model|Model|[A-Z]\w+)\.(objects|_default_manager)\b')
        allowed = {'RecordView.objects', 'UserPreference.objects'}  # the user's own rows, not records
        offenders = []
        for relative in self.VIEW_FILES:
            source = (BACKEND / relative).read_text(encoding='utf-8')
            for match in pattern.finditer(source):
                if match.group(0) not in allowed:
                    line = source[: match.start()].count('\n') + 1
                    offenders.append(f'{relative}:{line} {match.group(0)}')
        self.assertEqual(offenders, [], 'Use data.access.scoped_queryset() instead.')


class WriteAllowlistTests(Fixtures):
    clerk_perms = (
        'core.view_contact',
        'core.change_contact',
        'core.view_contact_tax_id',
        'core.view_country',
    )

    def patch(self, user, body):
        return client_for(user).patch(f'/api/data/core/contact/{self.company.pk}/', body, format='json')

    def test_a_read_only_field_is_rejected_by_name_not_dropped(self):
        response = self.patch(make_user('clerk', *self.clerk_perms), {'tax_id': 'NTN-9999999'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('tax_id', response.json())
        self.company.refresh_from_db()
        self.assertEqual(self.company.tax_id, 'NTN-1234567')

    def test_one_bad_key_rejects_the_whole_write(self):
        response = self.patch(make_user('clerk', *self.clerk_perms), {'name': 'Renamed', 'tax_id': 'X'})
        self.assertEqual(response.status_code, 400)
        self.company.refresh_from_db()
        self.assertEqual(self.company.name, 'Indus Traders')

    def test_unknown_hidden_and_server_owned_keys_get_the_same_refusal(self):
        user = make_user('limited', 'core.view_contact', 'core.change_contact')
        bodies = [{'no_such_field': 1}, {'tax_id': 'X'}, {'created_by': 1}, {'updated_at': '2020-01-01'}, {'id': 5}]
        messages = []
        for body in bodies:
            response = self.patch(user, body)
            self.assertEqual(response.status_code, 400, body)
            messages.append(response.json()[next(iter(body))])
        self.assertEqual(len({str(m) for m in messages}), 1, messages)

    def test_writable_fields_still_save(self):
        response = self.patch(make_user('clerk', *self.clerk_perms), {'city': 'Karachi'})
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.city, 'Karachi')

    def test_with_both_field_grants_the_field_saves(self):
        user = make_user('manager-ish', *self.clerk_perms, 'core.change_contact_tax_id')
        self.assertEqual(self.patch(user, {'tax_id': 'NTN-7654321'}).status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.tax_id, 'NTN-7654321')

    def test_the_data_layer_sets_who_created_and_changed_a_record(self):
        creator = grant_everything(make_user('creator'))
        response = client_for(creator).post('/api/data/core/contact/', {'name': 'New Co'}, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        record = Contact.objects.get(pk=response.json()['id'])
        self.assertEqual((record.created_by, record.updated_by), (creator, creator))

        editor = grant_everything(make_user('editor'))
        client_for(editor).patch(f'/api/data/core/contact/{record.pk}/', {'city': 'Lahore'}, format='json')
        record.refresh_from_db()
        self.assertEqual((record.created_by, record.updated_by), (creator, editor))

    def test_a_client_cannot_claim_to_be_someone_else(self):
        user = grant_everything(make_user('creator'))
        other = make_user('framed')
        response = client_for(user).post(
            '/api/data/core/contact/', {'name': 'X', 'created_by': other.pk}, format='json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('created_by', response.json())


class ReadableFieldsOnlyTests(Fixtures):
    """Filter, sort and search only on fields the user can read."""

    def setUp(self):
        super().setUp()
        self.client = client_for(make_user('limited', 'core.view_contact', 'core.view_country'))

    def test_sorting_by_a_hidden_field_is_refused(self):
        response = self.client.get('/api/data/core/contact/?ordering=-tax_id')
        self.assertEqual(response.status_code, 400)
        self.assertIn('ordering', response.json())

    def test_sorting_by_an_unknown_field_gets_the_same_refusal(self):
        hidden = self.client.get('/api/data/core/contact/?ordering=tax_id').json()
        unknown = self.client.get('/api/data/core/contact/?ordering=nonsense').json()
        self.assertEqual(hidden, unknown)

    def test_sorting_by_a_readable_field_works(self):
        self.assertEqual(self.client.get('/api/data/core/contact/?ordering=-name').status_code, 200)

    def test_filtering_by_a_hidden_field_is_refused(self):
        response = self.client.get('/api/data/core/contact/search/?tax_id=NTN-1234567')
        self.assertEqual(response.status_code, 400)
        self.assertIn('tax_id', response.json())

    def test_filtering_by_an_unknown_field_gets_the_same_refusal(self):
        hidden = self.client.get('/api/data/core/contact/search/?tax_id=x').json()['tax_id']
        unknown = self.client.get('/api/data/core/contact/search/?nonsense=x').json()['nonsense']
        self.assertEqual(hidden, unknown)

    def test_filtering_by_a_readable_field_works(self):
        response = self.client.get('/api/data/core/contact/search/?type=company')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['value'] for row in response.json()], [self.company.pk])
