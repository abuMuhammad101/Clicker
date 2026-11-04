"""Session limits: production keeps its short values, and only a demo machine can lengthen them."""
import json
import os
import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase

BACKEND = Path(__file__).resolve().parent.parent
PRODUCTION = {
    'CLICKER_ENV': 'production', 'DEBUG': 'False', 'ALLOWED_HOSTS': 'clicker.example.com',
    'SECRET_KEY': 'throwaway-' + 'x' * 60, 'DATABASE_URL': 'postgresql://u:p@127.0.0.1:1/none',
    'CORS_ALLOWED_ORIGINS': 'https://app.example.com', 'CSRF_TRUSTED_ORIGINS': 'https://app.example.com',
    'EMAIL_HOST': 'smtp.example.com', 'EMAIL_HOST_USER': 'u', 'EMAIL_HOST_PASSWORD': 'p',
}


def settings_in(env):
    """The session limits Django settles on under `env`, read in a fresh process."""
    clean = {k: v for k, v in os.environ.items() if not k.startswith(('CLICKER_', 'DJANGO_'))}
    code = (
        'import json, django.conf as c; s = c.settings; '
        'print(json.dumps([s.SESSION_COOKIE_AGE, s.CLICKER_SESSION_MAX_AGE]))'
    )
    result = subprocess.run(
        [sys.executable, '-c', code], cwd=BACKEND, capture_output=True, text=True,
        env={**clean, 'DJANGO_SETTINGS_MODULE': 'config.settings', **env},
    )
    return result


class SessionLimitTests(SimpleTestCase):
    def test_production_default_is_12_hours_idle_and_24_hours_absolute(self):
        result = settings_in(PRODUCTION)
        self.assertEqual(result.returncode, 0, result.stderr[-800:])
        self.assertEqual(json.loads(result.stdout), [12 * 3600, 24 * 3600])

    def test_a_demo_machine_can_lengthen_both_limits(self):
        result = settings_in({'SECRET_KEY': 'x' * 60, 'DATABASE_URL': PRODUCTION['DATABASE_URL'], 'CLICKER_DEMO_SESSION_HOURS': '36'})
        self.assertEqual(result.returncode, 0, result.stderr[-800:])
        self.assertEqual(json.loads(result.stdout), [36 * 3600, 36 * 3600])

    def test_production_refuses_to_start_with_the_demo_value_set(self):
        result = settings_in({**PRODUCTION, 'CLICKER_DEMO_SESSION_HOURS': '36'})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('demo machines only', result.stderr)
