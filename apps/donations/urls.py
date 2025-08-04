# apps/donations/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('', views.donation_page, name='donation_page'),
    path('edit/', views.edit_donation_settings, name='edit_donation_settings'),
]