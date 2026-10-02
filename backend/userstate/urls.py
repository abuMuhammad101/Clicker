from django.urls import path

from .views import PreferenceView, RecentsView

urlpatterns = [
    path('recents/', RecentsView.as_view(), name='recents'),
    path('preferences/<str:key>/', PreferenceView.as_view(), name='preference'),
]
