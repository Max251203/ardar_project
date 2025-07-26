# apps/core/views.py
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from django.contrib import messages
from django.utils import translation
from .forms import APIKeyForm, AgoraAPIForm
from .models import SiteSettings


def home(request):
    # Получаем 3 последние одобренные статьи
    from apps.articles.models import Article
    articles = Article.objects.filter(
        is_approved=True).order_by('-created_at')[:3]

    lang = translation.get_language()
    return render(request, "core/home.html", {
        "articles": articles,
        "is_ru": lang.startswith("ru"),
        "is_en": lang.startswith("en"),
        "is_hy": lang.startswith("hy"),
    })


def access_denied(request):
    return render(request, 'core/403.html')


@login_required
def api_settings(request):
    """Страница настроек API ключей для суперадмина"""
    # Проверяем, что пользователь является суперадмином
    if not request.user.is_superuser:
        return HttpResponseForbidden("Доступ запрещен. Требуются права суперадминистратора.")

    # Импортируем формы
    from .forms import APIKeyForm, AgoraAPIForm

    # Получаем текущие настройки
    armtts_key = SiteSettings.get_setting(
        'ARMTTS_API_KEY', '1e8d32c7c3msh767635ff925bcd7p13000fjsn07bbb0ccda3f')
    agora_app_id = SiteSettings.get_setting(
        'AGORA_APP_ID', '830a676dd3c642a2b939f313aabce70a')
    agora_app_certificate = SiteSettings.get_setting(
        'AGORA_APP_CERTIFICATE', 'c73861255a2d4e3891cd8ba922e142d5')
    agora_token_expire = SiteSettings.get_setting('AGORA_TOKEN_EXPIRE', '3600')

    if request.method == 'POST':
        # Обрабатываем обе формы
        armtts_form = APIKeyForm(request.POST)
        agora_form = AgoraAPIForm(request.POST)

        if 'save_armtts' in request.POST and armtts_form.is_valid():
            # Сохраняем ArmTTS API ключ
            SiteSettings.set_setting(
                'ARMTTS_API_KEY',
                armtts_form.cleaned_data['armtts_api_key'],
                'API ключ для сервиса ArmTTS'
            )
            messages.success(request, "API ключ ArmTTS успешно обновлен")
            return redirect('api_settings')

        elif 'save_agora' in request.POST and agora_form.is_valid():
            # Сохраняем Agora API настройки
            SiteSettings.set_setting(
                'AGORA_APP_ID',
                agora_form.cleaned_data['agora_app_id'],
                'Agora APP ID для видеотрансляций'
            )
            SiteSettings.set_setting(
                'AGORA_APP_CERTIFICATE',
                agora_form.cleaned_data['agora_app_certificate'],
                'Agora APP Certificate для видеотрансляций'
            )
            SiteSettings.set_setting(
                'AGORA_TOKEN_EXPIRE',
                str(agora_form.cleaned_data['agora_token_expire']),
                'Время жизни токена Agora в секундах'
            )
            messages.success(request, "Настройки Agora успешно обновлены")
            return redirect('api_settings')
    else:
        # Инициализируем формы текущими значениями
        armtts_form = APIKeyForm(initial={'armtts_api_key': armtts_key})
        agora_form = AgoraAPIForm(initial={
            'agora_app_id': agora_app_id,
            'agora_app_certificate': agora_app_certificate,
            'agora_token_expire': agora_token_expire
        })

    return render(request, 'core/api_settings.html', {
        'form': armtts_form,  # Для обратной совместимости
        'agora_form': agora_form,
        'armtts_key': armtts_key,
        'agora_app_id': agora_app_id,
        'agora_app_certificate': agora_app_certificate,
        'agora_token_expire': agora_token_expire
    })
