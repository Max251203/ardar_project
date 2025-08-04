from django.urls import path
from . import views

urlpatterns = [
    path('', views.donation_page, name='donation_page'),
    path('pay/', views.create_payment, name='create_payment'),
    path('success/', views.payment_success, name='payment_success'),
    path('fail/', views.payment_fail, name='payment_fail'),
    path('check/', views.payment_check, name='payment_check'),
]