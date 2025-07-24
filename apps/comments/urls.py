# apps/comments/urls.py

from django.urls import path
from . import views

urlpatterns = [
    # AJAX API: комментарии
    path('api/comments/<int:article_id>/submit/',
         views.ajax_submit_comment, name='ajax_submit_comment'),
    path('api/comments/<int:comment_id>/delete/',
         views.ajax_delete_comment, name='ajax_delete_comment'),

    # AJAX API: рейтинги
    path('api/ratings/<int:article_id>/submit/',
         views.ajax_submit_rating, name='ajax_submit_rating'),
    path('api/ratings/<int:rating_id>/delete/',
         views.ajax_delete_rating, name='ajax_delete_rating'),
]
