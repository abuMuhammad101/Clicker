"""
Defence in depth for the audit log: on Postgres, the database itself refuses
UPDATE and DELETE on foundation_auditentry, whatever code path asks. (TRUNCATE
is left alone: test teardown and `flush` use it, and neither runs against a
database anyone treats as history.)

Other databases (a throwaway SQLite for local checks) skip this; the model and
queryset guards still apply there.
"""
from django.db import migrations

FORWARD = """
CREATE OR REPLACE FUNCTION foundation_audit_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION USING MESSAGE = 'foundation_auditentry is append-only: ' || TG_OP || ' refused';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER foundation_auditentry_append_only
BEFORE UPDATE OR DELETE ON foundation_auditentry
FOR EACH ROW EXECUTE FUNCTION foundation_audit_append_only();
"""

BACKWARD = """
DROP TRIGGER IF EXISTS foundation_auditentry_append_only ON foundation_auditentry;
DROP FUNCTION IF EXISTS foundation_audit_append_only();
"""


def forward(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute(FORWARD)


def backward(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute(BACKWARD)


class Migration(migrations.Migration):
    dependencies = [('foundation', '0001_audit_entry')]
    operations = [migrations.RunPython(forward, backward)]
