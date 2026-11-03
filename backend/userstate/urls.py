from django.urls import path

from .saved_views import SavedViewDetailView, SavedViewListView
from .views import PreferenceView, RecentsView

urlpatterns = [
    path('recents/', RecentsView.as_view(), name='recents'),
    path('preferences/<str:key>/', PreferenceView.as_view(), name='preference'),
    path('views/<str:app_label>/<str:model_name>/', SavedViewListView.as_view(), name='saved-views'),
    path('views/<str:app_label>/<str:model_name>/<int:pk>/', SavedViewDetailView.as_view(), name='saved-view'),
]
