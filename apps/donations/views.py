import hashlib
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.shortcuts import render, redirect
from django.http import HttpResponse, JsonResponse
from django.contrib import messages
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.core.models import SiteSettings
from .models import Donation


def _get_conf(key, default=''):
    return SiteSettings.get_setting(key, getattr(settings, key, default))


def donation_page(request):
    receiver_info = _get_conf('PAYMENT_RECEIVER_INFO', '')
    return render(request, 'donations/donation_page.html', {'receiver_info': receiver_info})


def _build_pay_sign(merchant_id: str, amount_str: str, secret1: str, order_id: int) -> str:
    # Подпись для перехода на оплату (классическая формула FreeKassa)
    to_sign = f"{merchant_id}:{amount_str}:{secret1}:{order_id}"
    return hashlib.md5(to_sign.encode('utf-8')).hexdigest()


@require_POST
def create_payment(request):
    amount_raw = request.POST.get('amount')
    email = request.POST.get('email', '') or ''

    # Валидация суммы
    try:
        amount = Decimal(amount_raw).quantize(Decimal('0.01'))
        if amount < Decimal('10'):
            raise ValueError("Минимальная сумма — 10 ₽")
    except Exception:
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({'success': False, 'error': 'Некорректная сумма (минимум 10 ₽)'}, status=400)
        messages.error(request, "Некорректная сумма (минимум 10 ₽)")
        return redirect('donation_page')

    # Настройки FreeKassa
    merchant_id = _get_conf('FREEKASSA_MERCHANT_ID', '')
    secret1 = _get_conf('FREEKASSA_SECRET_1', '')
    currency = _get_conf('FREEKASSA_CURRENCY', 'RUB')

    if not merchant_id or not secret1:
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({'success': False, 'error': 'Платёжные настройки не заданы.'}, status=500)
        messages.error(request, "Платёжные настройки не заданы. Обратитесь к администратору.")
        return redirect('donation_page')

    # Создаем запись пожертвования
    donation = Donation.objects.create(amount=amount, email=email, status='pending')

    amount_str = f"{amount:.2f}".replace(',', '.')
    sign = _build_pay_sign(merchant_id, amount_str, secret1, donation.id)

    pay_url = f"https://pay.freekassa.ru/?m={merchant_id}&oa={amount_str}&o={donation.id}&s={sign}"
    if currency:
        pay_url += f"&currency={currency}"
    if email:
        pay_url += f"&email={email}"

    # AJAX: вернём JSON для открытия модалки; без AJAX — обычный редирект
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return JsonResponse({'success': True, 'pay_url': pay_url, 'order_id': donation.id})
    return redirect(pay_url)


def payment_success(request):
    # Важно: финальный статус лучше фиксировать по server-to-server коллбеку (payment_check)
    return render(request, 'donations/success.html')


def payment_fail(request):
    return render(request, 'donations/fail.html')


@csrf_exempt
def payment_check(request):
    """
    Серверный коллбек от FreeKassa.
    В настройках мерчанта укажите URL: https://<домен>/donations/check/
    Способ подписи у FreeKassa бывает разным — ниже реализованы 2 популярных варианта.
    При необходимости подкорректируйте в соответствии с настройками в кабинете.
    """
    data = request.POST if request.method == 'POST' else request.GET

    merchant_id = _get_conf('FREEKASSA_MERCHANT_ID', '')
    secret2 = _get_conf('FREEKASSA_SECRET_2', '')

    sent_sign = (data.get('SIGN') or data.get('sign') or '').lower()
    amount = data.get('AMOUNT') or data.get('amount') or ''
    order_id = data.get('MERCHANT_ORDER_ID') or data.get('order_id') or data.get('o') or ''

    if not sent_sign or not order_id:
        return HttpResponse("NO", status=400)

    # Вариант подписи 1 (часто встречается): md5(f"{merchant_id}:{amount}:{secret2}:{order_id}")
    calc1 = ''
    if merchant_id and amount and secret2:
        calc1 = hashlib.md5(f"{merchant_id}:{amount}:{secret2}:{order_id}".encode('utf-8')).hexdigest().lower()

    # Вариант подписи 2 (использовался в вашем черновике): md5(f"{order_id}:{secret2}")
    calc2 = hashlib.md5(f"{order_id}:{secret2}".encode('utf-8')).hexdigest().lower() if secret2 else ''

    if sent_sign in (calc1, calc2):
        donation = Donation.objects.filter(id=order_id).first()
        if donation:
            donation.status = 'success'
            donation.fk_payment_id = data.get('intid') or data.get('payment_id')
            donation.save()
            return HttpResponse("YES")
    return HttpResponse("NO")