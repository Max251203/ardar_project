# apps/donations/views.py
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from apps.core.models import SiteSettings
from django.contrib import messages

def donation_page(request):
    description = SiteSettings.get_setting('DONATION_DESCRIPTION', (
        "Дорогие друзья!\n\n"
        "Вы можете поддержать развитие нашего общественно-политического проекта. "
        "Ваша помощь позволит нам:\n"
        "- публиковать больше независимых материалов;\n"
        "- проводить прямые эфиры и дискуссии;\n"
        "- развивать новые сервисы для читателей.\n\n"
        "Любая сумма важна! Спасибо за вашу поддержку и доверие."
    ))
    merchant_login = SiteSettings.get_setting('ROBOKASSA_MERCHANT_LOGIN', 'demo')
    return render(request, 'donations/donation_page.html', {
        'description': description,
        'merchant_login': merchant_login,
    })

@login_required
def edit_donation_settings(request):
    if not request.user.is_superuser:
        return HttpResponseForbidden("Доступ только для суперадмина")
    if request.method == 'POST':
        description = request.POST.get('description', '')
        merchant_login = request.POST.get('merchant_login', '')
        SiteSettings.set_setting('DONATION_DESCRIPTION', description)
        SiteSettings.set_setting('ROBOKASSA_MERCHANT_LOGIN', merchant_login)
        messages.success(request, "Настройки обновлены")
        return redirect('donation_page')
    description = SiteSettings.get_setting('DONATION_DESCRIPTION', '')
    merchant_login = SiteSettings.get_setting('ROBOKASSA_MERCHANT_LOGIN', '')
    return render(request, 'donations/edit_donation_settings.html', {
        'description': description,
        'merchant_login': merchant_login,
    })