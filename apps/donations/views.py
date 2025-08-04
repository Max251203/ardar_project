# import hashlib
# from django.conf import settings
# from django.shortcuts import render, redirect
# from django.http import HttpResponse
# from django.contrib import messages
# from .models import Donation
# from django.views.decorators.csrf import csrf_exempt

# def donation_page(request):
#     return render(request, 'donations/donation_page.html')

# def create_payment(request):
#     if request.method == 'POST':
#         amount = request.POST.get('amount')
#         email = request.POST.get('email', '')

#         try:
#             amount_float = float(amount)
#             if amount_float < 10:
#                 messages.error(request, "Минимальная сумма - 10 рублей")
#                 return redirect('donation_page')
#         except:
#             messages.error(request, "Некорректная сумма")
#             return redirect('donation_page')

#         donation = Donation.objects.create(amount=amount, email=email)

#         m_id = str(settings.FREEKASSA_MERCHANT_ID)
#         secret = settings.FREEKASSA_SECRET_1
#         order_id = donation.id
#         sign_str = f"{m_id}:{amount}:{secret}:{order_id}"
#         sign = hashlib.md5(sign_str.encode('utf-8')).hexdigest()

#         payment_url = (
#             f"https://pay.freekassa.ru/?m={m_id}&oa={amount}&o={order_id}"
#             f"&s={sign}&email={email}"
#         )

#         return redirect(payment_url)

#     return redirect('donation_page')

# def payment_success(request):
#     messages.success(request, "Платеж успешно выполнен! Спасибо за поддержку.")
#     return render(request, 'donations/success.html')

# def payment_fail(request):
#     messages.error(request, "Платеж не был завершен.")
#     return render(request, 'donations/fail.html')

# @csrf_exempt
# def payment_check(request):
#     amount = request.GET.get('AMOUNT')
#     order_id = request.GET.get('MERCHANT_ORDER_ID')
#     sign = request.GET.get('SIGN')

#     expected_sign = hashlib.md5(f"{order_id}:{settings.FREEKASSA_SECRET_2}".encode()).hexdigest()

#     if sign == expected_sign:
#         donation = Donation.objects.filter(id=order_id).first()
#         if donation:
#             donation.status = 'success'
#             donation.save()
#             return HttpResponse("YES")
#     return HttpResponse("NO")

import hashlib
from django.conf import settings
from django.shortcuts import render, redirect
from django.http import HttpResponse
from django.contrib import messages
from .models import Donation
from django.views.decorators.csrf import csrf_exempt

def donation_page(request):
    return render(request, 'donations/donation_page.html')

def create_payment(request):
    if request.method == 'POST':
        amount = request.POST.get('amount')
        email = request.POST.get('email', '')
        
        # Временно: вместо перенаправления на Free-Kassa
        # просто создаем запись и показываем сообщение
        donation = Donation.objects.create(
            amount=amount, 
            email=email,
            status='pending'
        )
        
        messages.success(request, f"Тестовый режим: создано пожертвование #{donation.id} на сумму {amount} ₽")
        return redirect('donation_page')
    
    return redirect('donation_page')

def payment_success(request):
    return render(request, 'donations/success.html')

def payment_fail(request):
    return render(request, 'donations/fail.html')

@csrf_exempt
def payment_check(request):
    # Временная заглушка
    return HttpResponse("OK")