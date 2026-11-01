from django.apps import AppConfig


class WorkflowLabConfig(AppConfig):
    """
    A throwaway app for S-3: the workflow, numbering and approval rules drafted
    on a lab bill and a lab adjustment before S-5's real Bills and
    Adjustments use them.

    Installed for tests, and in development only with CLICKER_LAB=1
    (config/settings.py), to look at the workflow screens. Never in
    production. Delete it once S-5's real models carry a workflow.
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'workflowlab'
    verbose_name = 'Workflow lab'
