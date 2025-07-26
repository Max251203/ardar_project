from django.db import models
from django.conf import settings

class LivestreamRoom(models.Model):
    """Модель комнаты для прямого эфира или конференции"""
    ROOM_TYPE_CHOICES = (
        ('broadcast', 'Прямой эфир'),
        ('conference', 'Конференция'),
    )
    name = models.CharField(max_length=100, unique=True, verbose_name="Название комнаты")
    host = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, verbose_name="Ведущий")
    type = models.CharField(max_length=20, choices=ROOM_TYPE_CHOICES, default='broadcast', verbose_name="Тип")
    started_at = models.DateTimeField(auto_now_add=True, verbose_name="Время начала")
    is_active = models.BooleanField(default=True, verbose_name="Активна")
    description = models.TextField(blank=True, null=True, verbose_name="Описание")
    
    class Meta:
        verbose_name = "Комната трансляции"
        verbose_name_plural = "Комнаты трансляций"
        ordering = ['-started_at']
    
    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"