from django.urls import path
from . import views

urlpatterns = [
    path('', views.livestream_list, name='livestream_list'),
    path('list_ajax/', views.livestream_list_ajax, name='livestream_list_ajax'),
    path('create/', views.create_livestream, name='create_livestream'),
    path('room/<int:room_id>/', views.livestream_room, name='livestream_room'),
    path('token/', views.generate_token, name='generate_token'),
    path('end/<int:room_id>/', views.end_livestream, name='end_livestream'),
    path('chat/<int:room_id>/', views.livestream_chat, name='livestream_chat'),
    path('invite/<int:room_id>/', views.livestream_invite,
         name='livestream_invite'),
    path('kick/<int:room_id>/<int:user_id>/',
         views.livestream_kick, name='livestream_kick'),
    path('mute/<int:room_id>/<int:user_id>/',
         views.livestream_mute, name='livestream_mute'),
    path('grant/<int:room_id>/<int:user_id>/',
         views.livestream_grant, name='livestream_grant'),
    path('approve/<int:room_id>/<int:user_id>/',
         views.livestream_approve, name='livestream_approve'),
    path('users/<int:room_id>/', views.livestream_users, name='livestream_users'),
    path('check_status/<int:room_id>/',
         views.check_user_status, name='check_user_status'),
]
