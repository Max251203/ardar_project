from django.urls import path
from .views import auth_view, logout_user

urlpatterns = [
    path('', auth_view, name='auth'),
    path('logout/', logout_user, name='logout_user'),
]
