from django.urls import path

from .views import (
    ModelAggregateView,
    ModelBulkActionView,
    ModelRecordDetailView,
    ModelRecordHistoryView,
    ModelRecordListView,
    ModelRecordTransitionView,
    ModelSearchView,
)

urlpatterns = [
    path('<str:app_label>/<str:model_name>/', ModelRecordListView.as_view(), name='model-records'),
    path('<str:app_label>/<str:model_name>/search/', ModelSearchView.as_view(), name='model-search'),
    path('<str:app_label>/<str:model_name>/aggregate/', ModelAggregateView.as_view(), name='model-aggregate'),
    path('<str:app_label>/<str:model_name>/bulk/<str:key>/', ModelBulkActionView.as_view(), name='model-bulk'),
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
    path(
        '<str:app_label>/<str:model_name>/<int:pk>/transitions/<str:name>/',
        ModelRecordTransitionView.as_view(),
        name='model-record-transition',
    ),
]
