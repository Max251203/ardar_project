# apps/comments/models.py
from django.db import models
from django.contrib.auth import get_user_model
from apps.articles.models import Article

User = get_user_model()


class Comment(models.Model):
    article = models.ForeignKey(
        Article, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Комментарий от {self.author.name} к статье {self.article.title}'


class Rating(models.Model):
    RATING_CHOICES = (
        (1, '1 - Очень плохо'),
        (2, '2 - Плохо'),
        (3, '3 - Нормально'),
        (4, '4 - Хорошо'),
        (5, '5 - Отлично'),
    )

    article = models.ForeignKey(
        Article, on_delete=models.CASCADE, related_name='ratings')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    value = models.IntegerField(choices=RATING_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('article', 'user')

    def __str__(self):
        return f'Оценка {self.value} от {self.user.name} для статьи {self.article.title}'
