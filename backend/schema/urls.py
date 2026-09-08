from django.urls import path

from .views import ModelSchemaView

urlpatterns = [
    path('<str:app_label>/<str:model_name>/', ModelSchemaView.as_view(), name='model-schema'),
]
