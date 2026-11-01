from django.apps import AppConfig


class WorkflowLabConfig(AppConfig):
    """
    A throwaway app for S-3: the workflow, numbering and approval rules drafted
    on one model before S-5's real Invoice and Adjustment use them.

    Installed only while tests run (config/settings.py). Its migration exists
    because the test database is built by migrating (and the table points at
    auth_user), but it only ever runs there: Neon never sees the table, and
    no real user ever has it in their navigation.
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'workflowlab'
    verbose_name = 'Workflow lab'
