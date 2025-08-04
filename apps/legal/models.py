from django.db import models
from ckeditor_uploader.fields import RichTextUploadingField


class LegalDocument(models.Model):
    title = models.CharField(
        max_length=255, default="Политика конфиденциальности и условия использования")
    content = RichTextUploadingField()
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    class Meta:
        verbose_name = "Правовой документ"
        verbose_name_plural = "Правовые документы"
