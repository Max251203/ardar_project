from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from django.contrib import messages
from django.utils import translation
from django.conf import settings

from .forms import APIKeyForm, AgoraAPIForm, FreeKassaForm
from .models import SiteSettings


def home(request):
    from apps.articles.models import Article
    articles = Article.objects.filter(is_approved=True).order_by('-created_at')[:3]

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
    if not request.user.is_superuser:
        return HttpResponseForbidden("Доступ запрещен. Требуются права суперадминистратора.")

    # Текущие значения (с fallback на settings.py/env)
    armtts_key = SiteSettings.get_setting('ARMTTS_API_KEY', getattr(settings, 'ARMTTS_API_KEY', ''))
    agora_app_id = SiteSettings.get_setting('AGORA_APP_ID', getattr(settings, 'AGORA_APP_ID', ''))
    agora_app_certificate = SiteSettings.get_setting('AGORA_APP_CERTIFICATE', getattr(settings, 'AGORA_APP_CERTIFICATE', ''))
    agora_token_expire = SiteSettings.get_setting('AGORA_TOKEN_EXPIRE', str(getattr(settings, 'AGORA_TOKEN_EXPIRE', 3600)))

    fk_merchant_id = SiteSettings.get_setting('FREEKASSA_MERCHANT_ID', getattr(settings, 'FREEKASSA_MERCHANT_ID', ''))
    fk_secret1 = SiteSettings.get_setting('FREEKASSA_SECRET_1', getattr(settings, 'FREEKASSA_SECRET_1', ''))
    fk_secret2 = SiteSettings.get_setting('FREEKASSA_SECRET_2', getattr(settings, 'FREEKASSA_SECRET_2', ''))
    fk_currency = SiteSettings.get_setting('FREEKASSA_CURRENCY', 'RUB')
    receiver_info = SiteSettings.get_setting('PAYMENT_RECEIVER_INFO', '')

    if request.method == 'POST':
        armtts_form = APIKeyForm(request.POST)
        agora_form = AgoraAPIForm(request.POST)
        fk_form = FreeKassaForm(request.POST)

        if 'save_armtts' in request.POST and armtts_form.is_valid():
            SiteSettings.set_setting('ARMTTS_API_KEY', armtts_form.cleaned_data['armtts_api_key'], 'API ключ для сервиса ArmTTS')
            messages.success(request, "API ключ ArmTTS успешно обновлен")
            return redirect('api_settings')

        elif 'save_agora' in request.POST and agora_form.is_valid():
            SiteSettings.set_setting('AGORA_APP_ID', agora_form.cleaned_data['agora_app_id'], 'Agora APP ID для видеотрансляций')
            SiteSettings.set_setting('AGORA_APP_CERTIFICATE', agora_form.cleaned_data['agora_app_certificate'], 'Agora APP Certificate')
            SiteSettings.set_setting('AGORA_TOKEN_EXPIRE', str(agora_form.cleaned_data['agora_token_expire']), 'Время жизни токена Agora в секундах')
            messages.success(request, "Настройки Agora успешно обновлены")
            return redirect('api_settings')

        elif 'save_freekassa' in request.POST and fk_form.is_valid():
            SiteSettings.set_setting('FREEKASSA_MERCHANT_ID', fk_form.cleaned_data['merchant_id'], 'FreeKassa Merchant ID')
            SiteSettings.set_setting('FREEKASSA_SECRET_1', fk_form.cleaned_data['secret1'], 'FreeKassa Secret word #1')
            SiteSettings.set_setting('FREEKASSA_SECRET_2', fk_form.cleaned_data['secret2'], 'FreeKassa Secret word #2')
            SiteSettings.set_setting('FREEKASSA_CURRENCY', fk_form.cleaned_data['currency'], 'Валюта приема платежей')
            SiteSettings.set_setting('PAYMENT_RECEIVER_INFO', fk_form.cleaned_data['receiver_info'], 'Реквизиты получателя (для справки)')
            messages.success(request, "Настройки FreeKassa успешно обновлены")
            return redirect('api_settings')

    else:
        armtts_form = APIKeyForm(initial={'armtts_api_key': armtts_key})
        agora_form = AgoraAPIForm(initial={
            'agora_app_id': agora_app_id,
            'agora_app_certificate': agora_app_certificate,
            'agora_token_expire': agora_token_expire
        })
        fk_form = FreeKassaForm(initial={
            'merchant_id': fk_merchant_id,
            'secret1': fk_secret1,
            'secret2': fk_secret2,
            'currency': fk_currency,
            'receiver_info': receiver_info
        })

    return render(request, 'core/api_settings.html', {
        'form': armtts_form,
        'agora_form': agora_form,
        'fk_form': fk_form,
        'armtts_key': armtts_key,
        'agora_app_id': agora_app_id,
        'agora_app_certificate': agora_app_certificate,
        'agora_token_expire': agora_token_expire
    })