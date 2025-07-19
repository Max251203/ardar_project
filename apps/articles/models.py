from django.db import models
from django.contrib.auth import get_user_model


class Article(models.Model):
    LANGS = [
        ('ru', 'Русский'),
        ('en', 'English'),
        ('hy', 'Հայերեն'),
    ]

    title = models.CharField(max_length=200)
    image = models.ImageField(
        upload_to='article_images/', null=True, blank=True)  # 👈 изображение
    language = models.CharField(max_length=2, choices=LANGS, default='ru')
    text = models.TextField()
    audio = models.FileField(upload_to='tts/', null=True, blank=True)
    author = models.ForeignKey(get_user_model(), on_delete=models.CASCADE)
    is_approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title
