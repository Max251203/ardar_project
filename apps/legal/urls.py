from django.urls import path
from . import views

urlpatterns = [
    path('', views.legal_page, name='legal_page'),
    path('edit/', views.edit_legal_page, name='edit_legal_page'),
]
