from django.urls import path

from .views import ModelRecordDetailView, ModelRecordHistoryView, ModelRecordListView, ModelSearchView

urlpatterns = [
    path('<str:app_label>/<str:model_name>/', ModelRecordListView.as_view(), name='model-records'),
    path('<str:app_label>/<str:model_name>/search/', ModelSearchView.as_view(), name='model-search'),
    path(
        '<str:app_label>/<str:model_name>/<int:pk>/',
        ModelRecordDetailView.as_view(),
        name='model-record',
    ),
    path(
        '<str:app_label>/<str:model_name>/<int:pk>/history/',
        ModelRecordHistoryView.as_view(),
        name='model-record-history',
    ),
]
