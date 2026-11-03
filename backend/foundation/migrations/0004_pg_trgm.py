from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations


class Migration(migrations.Migration):
    """Trigram matching for search indexes (pg_trgm). Neon allows it; idempotent."""

    dependencies = [('foundation', '0003_sequence_and_transition_action')]

    operations = [TrigramExtension()]
