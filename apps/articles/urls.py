from django.urls import path
from .views import (
    article_list, article_detail, article_create, process_file,
    generate_audio_armtts, get_article_image, remove_article_image
)

urlpatterns = [
    path('', article_list, name='article_list'),
    path('<int:pk>/', article_detail, name='article_detail'),
    path('create/', article_create, name='article_create'),
    path('<int:pk>/generate-audio-armtts/',
         generate_audio_armtts, name='generate_audio_armtts'),
    path('process-file/', process_file, name='process_file'),
    path('image/<int:pk>/', get_article_image, name='article_image'),
    path('<int:pk>/remove-image/', remove_article_image,
         name='remove_article_image'),
]
