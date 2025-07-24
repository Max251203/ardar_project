# apps/core/models.py
from django.db import models

# Create your models here.


class SiteSettings(models.Model):
    """Модель для хранения настроек сайта"""
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField(blank=True)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        verbose_name = "Настройка сайта"
        verbose_name_plural = "Настройки сайта"

    def __str__(self):
        return self.key

    @classmethod
    def get_setting(cls, key, default=None):
        """Получить значение настройки по ключу"""
        try:
            return cls.objects.get(key=key).value
        except cls.DoesNotExist:
            return default

    @classmethod
    def set_setting(cls, key, value, description=''):
        """Установить значение настройки"""
        obj, created = cls.objects.update_or_create(
            key=key,
            defaults={'value': value, 'description': description}
        )
        return obj
