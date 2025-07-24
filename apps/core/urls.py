# apps/core/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('access-denied/', views.access_denied, name='access_denied'),
    path('api-settings/', views.api_settings, name='api_settings'),
]
