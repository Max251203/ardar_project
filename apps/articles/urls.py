# apps/articles/urls.py
from django.urls import path
from .views import (
    article_list, article_detail, article_create, generate_audio, process_file
)

urlpatterns = [
    path('', article_list, name='article_list'),
    path('<int:pk>/', article_detail, name='article_detail'),
    path('create/', article_create, name='article_create'),
    path('<int:pk>/generate-audio/', generate_audio, name='generate_audio'),
    path('process-file/', process_file, name='process_file'),
]
