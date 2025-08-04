from django.contrib import admin
from .models import Article


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'language', 'is_approved', 'created_at')
    list_filter = ('is_approved', 'language')
    search_fields = ('title', 'text')
    list_editable = ('is_approved',)
