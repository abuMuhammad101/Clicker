from django.db import connection, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Contact, Country
from foundation.models import AppendOnlyError, AuditEntry
from foundation.testing import grant_everything, make_user


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


class AuditTrailTests(TestCase):
    def setUp(self):
        self.manager = grant_everything(make_user('manager'))
        self.client = client_for(self.manager)
        self.country = Country.objects.create(name='Pakistan', code='PK')

    def create_contact(self, **values):
        response = self.client.post('/api/data/core/contact/', {'name': 'Indus Traders', **values}, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()['id']

    def test_a_create_writes_exactly_one_entry_with_after_values(self):
        pk = self.create_contact(type='company', tax_id='NTN-1', country=self.country.pk)
        entries = AuditEntry.objects.filter(record_id=str(pk))
        self.assertEqual(entries.count(), 1)
        entry = entries.get()
        self.assertEqual(entry.action, 'create')
        self.assertEqual(entry.actor, self.manager)
        self.assertEqual(entry.actor_username, 'manager')
        self.assertEqual(entry.ip_address, '127.0.0.1')
        self.assertEqual(entry.changes['name'], {'before': None, 'after': 'Indus Traders'})
        self.assertEqual(entry.changes['tax_id'], {'before': None, 'after': 'NTN-1'})
        self.assertEqual(entry.changes['country'], {'before': None, 'after': self.country.pk})

    def test_an_update_writes_one_entry_with_only_what_changed(self):
        pk = self.create_contact(city='Lahore')
        response = self.client.patch(f'/api/data/core/contact/{pk}/', {'city': 'Karachi', 'name': 'Indus Traders'}, format='json')
        self.assertEqual(response.status_code, 200)
        updates = AuditEntry.objects.filter(record_id=str(pk), action='update')
        self.assertEqual(updates.count(), 1)
        self.assertEqual(updates.get().changes, {'city': {'before': 'Lahore', 'after': 'Karachi'}})

    def test_a_refused_write_leaves_no_entry(self):
        pk = self.create_contact()
        before = AuditEntry.objects.count()
        self.client.patch(f'/api/data/core/contact/{pk}/', {'nonsense': 1}, format='json')
        self.client.post('/api/data/core/contact/', {}, format='json')
        self.assertEqual(AuditEntry.objects.count(), before)

    def test_entries_cannot_be_changed_or_removed_through_django(self):
        entry = AuditEntry.objects.get(record_id=str(self.create_contact()))
        entry.action = 'update'
        with self.assertRaises(AppendOnlyError):
            entry.save()
        with self.assertRaises(AppendOnlyError):
            entry.delete()
        with self.assertRaises(AppendOnlyError):
            AuditEntry.objects.all().update(action='update')
        with self.assertRaises(AppendOnlyError):
            AuditEntry.objects.all().delete()

    def test_the_database_itself_refuses_update_and_delete(self):
        if connection.vendor != 'postgresql':
            self.skipTest('The trigger is Postgres-only.')
        entry = AuditEntry.objects.get(record_id=str(self.create_contact()))
        for sql in (
            'UPDATE foundation_auditentry SET action = %s WHERE id = %s',
            'DELETE FROM foundation_auditentry WHERE id = %s',
        ):
            params = ['update', entry.pk] if sql.startswith('UPDATE') else [entry.pk]
            with self.assertRaises(Exception), transaction.atomic(), connection.cursor() as cursor:
                cursor.execute(sql, params)
        self.assertTrue(AuditEntry.objects.filter(pk=entry.pk, action='create').exists())


class HistoryEndpointTests(TestCase):
    def setUp(self):
        manager = grant_everything(make_user('manager'))
        self.manager_client = client_for(manager)
        response = self.manager_client.post(
            '/api/data/core/contact/', {'name': 'Indus', 'type': 'company', 'tax_id': 'NTN-1'}, format='json'
        )
        self.pk = response.json()['id']
        self.manager_client.patch(f'/api/data/core/contact/{self.pk}/', {'tax_id': 'NTN-2', 'city': 'Karachi'}, format='json')
        self.url = f'/api/data/core/contact/{self.pk}/history/'

    def test_newest_first_with_actor(self):
        results = self.manager_client.get(self.url).json()['results']
        self.assertEqual([r['action'] for r in results], ['update', 'create'])
        self.assertEqual(results[0]['actor']['display_name'], 'manager')
        self.assertNotIn('ip_address', results[0])

    def test_someone_who_cant_see_the_record_gets_404(self):
        nobody = client_for(make_user('nobody'))
        self.assertEqual(nobody.get(self.url).status_code, 404)

    def test_hidden_fields_are_removed_from_history_too(self):
        clerkish = client_for(make_user('clerkish', 'core.view_contact'))
        results = clerkish.get(self.url).json()['results']
        self.assertEqual(results[0]['changes'], {'city': {'before': '', 'after': 'Karachi'}})
        self.assertTrue(all('tax_id' not in r['changes'] for r in results))
