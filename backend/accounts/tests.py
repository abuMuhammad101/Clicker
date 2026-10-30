from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.views import INVALID_CREDENTIALS, LOCKED_OUT

PASSWORD = 'correct-horse-battery-1'


class LoginThrottlingTests(TestCase):
    def setUp(self):
        get_user_model().objects.create_user('amina', password=PASSWORD)
        self.client = APIClient(enforce_csrf_checks=False)

    def attempt(self, username='amina', password='wrong', ip='203.0.113.7'):
        return self.client.post(
            '/api/auth/login/', {'username': username, 'password': password}, format='json', REMOTE_ADDR=ip
        )

    def test_the_sixth_rapid_failure_is_locked_out_even_with_the_right_password(self):
        for _ in range(5):
            response = self.attempt()
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()['detail'], INVALID_CREDENTIALS)
        locked = self.attempt(password=PASSWORD)
        self.assertEqual(locked.status_code, 429)
        self.assertEqual(locked.json()['detail'], LOCKED_OUT)

    def test_an_unknown_username_fails_and_locks_exactly_like_a_real_one(self):
        for _ in range(5):
            response = self.attempt(username='nobody-here')
            self.assertEqual((response.status_code, response.json()['detail']), (400, INVALID_CREDENTIALS))
        self.assertEqual(self.attempt(username='nobody-here').status_code, 429)

    def test_the_lock_is_per_username_and_address_together(self):
        for _ in range(5):
            self.attempt()
        # Same person, another address; another name, same address: both unaffected.
        self.assertEqual(self.attempt(password=PASSWORD, ip='198.51.100.9').status_code, 200)
        self.assertEqual(self.attempt(username='someone-else').status_code, 400)

    def test_a_success_clears_the_count(self):
        for _ in range(4):
            self.attempt()
        self.assertEqual(self.attempt(password=PASSWORD).status_code, 200)
        self.client.post('/api/auth/logout/')
        self.client = APIClient()
        for _ in range(5):
            self.assertEqual(self.attempt().status_code, 400)


class AbsoluteSessionLifetimeTests(TestCase):
    def test_a_session_older_than_the_limit_ends_however_active(self):
        import time

        from django.conf import settings

        from foundation.middleware import SESSION_STARTED_KEY

        get_user_model().objects.create_user('amina', password=PASSWORD)
        client = APIClient()
        self.assertEqual(
            client.post('/api/auth/login/', {'username': 'amina', 'password': PASSWORD}, format='json').status_code,
            200,
        )
        self.assertEqual(client.get('/api/auth/me/').status_code, 200)

        session = client.session
        session[SESSION_STARTED_KEY] = int(time.time()) - settings.CLICKER_SESSION_MAX_AGE - 1
        session.save()
        self.assertEqual(client.get('/api/auth/me/').status_code, 401)
