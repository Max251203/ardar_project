# apps/articles/models.py
from django.db import models
from django.contrib.auth import get_user_model
from ckeditor_uploader.fields import RichTextUploadingField


class Article(models.Model):
    LANGS = [
        ('ru', 'Русский'),
        ('en', 'English'),
        ('hy', 'Հայերեն'),
    ]

    title = models.CharField(max_length=200)
    language = models.CharField(max_length=2, choices=LANGS, default='ru')

    # Поля для хранения изображения в БД
    image_data = models.BinaryField(null=True, blank=True)
    image_name = models.CharField(max_length=255, null=True, blank=True)
    image_type = models.CharField(max_length=100, null=True, blank=True)

    # Используем RichTextUploadingField для текста
    text = RichTextUploadingField(blank=True)

    author = models.ForeignKey(get_user_model(), on_delete=models.CASCADE)
    is_approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

    # Метод для получения URL изображения
    @property
    def image_url(self):
        if self.image_data:
            return f"/articles/image/{self.id}/"
        return None
