from django.urls import path
from .views import article_list, article_detail, article_create, generate_audio, moderate_articles, approve_article, reject_article

urlpatterns = [
    path('', article_list, name='article_list'),
    path('<int:pk>/', article_detail, name='article_detail'),
    path('create/', article_create, name='article_create'),
    path('<int:pk>/generate-audio/', generate_audio, name='generate_audio'),
    path('moderate/', moderate_articles, name='moderate_articles'),
    path('moderate/<int:pk>/approve/', approve_article, name='approve_article'),
    path('moderate/<int:pk>/reject/', reject_article, name='reject_article'),
]
