from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.conf.urls.i18n import set_language


urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('apps.core.urls')),             # Главная
    path('auth/', include('apps.users.urls')),       # Авторизация
    path('articles/', include('apps.articles.urls')),  # Публичные статьи
    path('admin-panel/', include('apps.admin_panel.urls')),  # ✅ Панель админа
    path('i18n/setlang/', set_language, name='set_language')
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL,
                          document_root=settings.MEDIA_ROOT)
