# apps/admin_panel/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # Главная панель
    path('', views.admin_dashboard, name='admin_dashboard'),

    # CRUD статьи
    path('articles/', views.admin_articles, name='admin_articles'),
    path('articles/create/', views.admin_create_article,
         name='admin_create_article'),
    path('articles/<int:pk>/edit/', views.admin_edit_article,
         name='admin_edit_article'),
    path('articles/<int:pk>/delete/', views.admin_delete_article,
         name='admin_delete_article'),
    path('articles/<int:pk>/approve/', views.admin_approve_article,
         name='admin_approve_article'),
    path('articles/<int:pk>/reject/', views.admin_reject_article,
         name='admin_reject_article'),

    # CRUD пользователи
    path('users/', views.admin_users, name='admin_users'),
    path('users/create/', views.admin_create_user, name='admin_create_user'),
    path('users/<int:user_id>/edit/',
         views.admin_edit_user, name='admin_edit_user'),
    path('users/<int:user_id>/delete/',
         views.admin_delete_user, name='admin_delete_user'),
    path('users/<int:user_id>/change-role/',
         views.admin_change_role, name='admin_change_role'),
]
