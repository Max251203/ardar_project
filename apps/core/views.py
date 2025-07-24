# apps/core/views.py
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from django.contrib import messages
from django.utils import translation
from .forms import APIKeyForm
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

    # Получаем текущий ключ ArmTTS или используем значение по умолчанию
    default_key = '1e8d32c7c3msh767635ff925bcd7p13000fjsn07bbb0ccda3f'
    try:
        # Пробуем получить существующую настройку
        current_key = SiteSettings.get_setting('ARMTTS_API_KEY', default_key)
    except:
        # Если возникла ошибка (например, таблица не существует), используем значение по умолчанию
        current_key = default_key

    if request.method == 'POST':
        form = APIKeyForm(request.POST)
        if form.is_valid():
            new_key = form.cleaned_data['armtts_api_key']
            try:
                # Создаем или обновляем настройку
                SiteSettings.set_setting(
                    'ARMTTS_API_KEY',
                    new_key,
                    'API ключ для сервиса ArmTTS'
                )
                messages.success(request, "API ключ успешно обновлен")
            except Exception as e:
                messages.error(
                    request, f"Ошибка при сохранении ключа: {str(e)}")
            return redirect('api_settings')
    else:
        form = APIKeyForm(initial={'armtts_api_key': current_key})

    return render(request, 'core/api_settings.html', {
        'form': form,
        'current_key': current_key
    })
