# apps/articles/urls.py
from django.urls import path
from .views import (
    article_list, article_detail, article_create, generate_audio,
    admin_dashboard, admin_articles, admin_users, admin_approve_article, admin_reject_article, admin_change_role
)

urlpatterns = [
    path('', article_list, name='article_list'),
    path('<int:pk>/', article_detail, name='article_detail'),
    path('create/', article_create, name='article_create'),
    path('<int:pk>/generate-audio/', generate_audio, name='generate_audio'),

    # Админка
    path('admin/', admin_dashboard, name='admin_dashboard'),
    path('admin/articles/', admin_articles, name='admin_articles'),
    path('admin/users/', admin_users, name='admin_users'),
    path('admin/articles/<int:pk>/approve/',
         admin_approve_article, name='admin_approve_article'),
    path('admin/articles/<int:pk>/reject/',
         admin_reject_article, name='admin_reject_article'),
    path('admin/users/<int:user_id>/change-role/',
         admin_change_role, name='admin_change_role'),
]
