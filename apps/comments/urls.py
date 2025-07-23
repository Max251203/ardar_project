from django.urls import path
from . import views

urlpatterns = [
    path('article/<int:article_id>/comment/',
         views.add_comment, name='add_comment'),
    path('comment/<int:comment_id>/edit/',
         views.edit_comment, name='edit_comment'),
    path('comment/<int:comment_id>/delete/',
         views.delete_comment, name='delete_comment'),
    path('article/<int:article_id>/rate/',
         views.rate_article, name='rate_article'),
]
