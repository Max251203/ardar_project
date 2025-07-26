from django.urls import path
from . import views

urlpatterns = [
    path('', views.livestream_list, name='livestream_list'),
    path('create/', views.create_livestream, name='create_livestream'),
    path('room/<str:room_name>/', views.livestream_room, name='livestream_room'),
    path('room_agora/<str:room_name>/',
         views.livestream_room_agora, name='livestream_room_agora'),
    path('end/<str:room_name>/', views.end_livestream, name='end_livestream'),
    path('token/', views.generate_token, name='generate_token'),
]
