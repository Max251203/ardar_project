from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.conf.urls.i18n import set_language

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('apps.core.urls')),
    path('auth/', include('apps.users.urls')),
    path('articles/', include('apps.articles.urls')),
    path('admin-panel/', include('apps.admin_panel.urls')),
    path('legal/', include('apps.legal.urls')),
    path('i18n/setlang/', set_language, name='set_language'),
    path('ckeditor/', include('ckeditor_uploader.urls')),
    path('comments/', include('apps.comments.urls')),
    path('livestream/', include('apps.livestream.urls')),
    path('donations/', include('apps.donations.urls')),
]

# Добавь это для работы статических файлов в продакшене
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)