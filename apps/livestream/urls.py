from django.urls import path
from . import views

urlpatterns = [
    path('', views.livestream_list, name='livestream_list'),
    path('list_ajax/', views.livestream_list_ajax, name='livestream_list_ajax'),
    path('create/', views.create_livestream, name='create_livestream'),
    path('room/<int:room_id>/', views.livestream_room, name='livestream_room'),
    path('end/<int:room_id>/', views.end_livestream, name='end_livestream'),

    path('token/', views.generate_token, name='generate_token'),  # RTC
    path('rtm_token/', views.generate_rtm_token, name='generate_rtm_token'),  # RTM

    path('chat/<int:room_id>/', views.livestream_chat, name='livestream_chat'),
    path('users/<int:room_id>/', views.livestream_users, name='livestream_users'),
    path('raise_hand/<int:room_id>/', views.livestream_raise_hand, name='livestream_raise_hand'),
    path('lower_hand/<int:room_id>/', views.livestream_lower_hand, name='livestream_lower_hand'),
    path('check_status/<int:room_id>/', views.check_user_status, name='check_user_status'),
]