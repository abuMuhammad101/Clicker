from django.urls import path

from .views import ModelSearchView

urlpatterns = [
    path('<str:app_label>/<str:model_name>/search/', ModelSearchView.as_view(), name='model-search'),
]
