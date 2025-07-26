from agora_token_builder import RtcTokenBuilder
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponseForbidden
from django.contrib import messages
from django.utils.crypto import get_random_string
from .models import LivestreamRoom
from apps.core.models import SiteSettings
import time
import json


@login_required
def livestream_list(request):
    """Список всех активных трансляций"""
    rooms = LivestreamRoom.objects.filter(is_active=True)
    return render(request, 'livestream/list.html', {
        'rooms': rooms
    })


@login_required
def create_livestream(request):
    """
    Создание новой трансляции.
    Пользователь, создающий трансляцию, автоматически становится ведущим.
    """
    # Проверяем права пользователя
    if not (request.user.is_superuser or getattr(request.user, 'role', '') in ['admin', 'privileged']):
        messages.error(request, "У вас нет прав для создания трансляций")
        return redirect('livestream_list')

    if request.method == 'POST':
        # Генерируем более понятное название комнаты
        room_name = f"ardar-{get_random_string(6).lower()}"
        room_type = request.POST.get('type', 'broadcast')
        description = request.POST.get('description', '')

        # Создаем комнату, текущий пользователь становится ведущим
        room = LivestreamRoom.objects.create(
            name=room_name,
            host=request.user,  # Текущий пользователь - ведущий
            type=room_type,
            description=description
        )

        messages.success(
            request, f"Трансляция создана успешно. Вы назначены ведущим.")
        return redirect('livestream_room_agora', room_name=room_name)

    return render(request, 'livestream/create.html')


@login_required
def livestream_room(request, room_name):
    # Jitsi
    room = get_object_or_404(LivestreamRoom, name=room_name, is_active=True)
    is_host = (request.user == room.host)
    return render(request, 'livestream/room.html', {
        'room': room,
        'is_host': is_host,
        'user_name': request.user.name
    })


@login_required
def livestream_room_agora(request, room_name):
    # Agora
    room = get_object_or_404(LivestreamRoom, name=room_name, is_active=True)
    app_id = SiteSettings.get_setting('AGORA_APP_ID')
    is_host = (request.user == room.host)
    return render(request, 'livestream/room_agora.html', {
        'room': room,
        'app_id': app_id,
        'is_host': is_host,
        'user_id': str(request.user.id),
        'user_name': request.user.name
    })


@login_required
def generate_token(request):
    channel = request.GET.get('channel')
    uid = int(request.GET.get('uid', 0))
    role = int(request.GET.get('role', 1))  # 1 = publisher, 2 = subscriber

    app_id = SiteSettings.get_setting('AGORA_APP_ID')
    app_certificate = SiteSettings.get_setting('AGORA_APP_CERTIFICATE')
    expire = int(SiteSettings.get_setting('AGORA_TOKEN_EXPIRE', '3600'))

    current_ts = int(time.time())
    privilege_expired_ts = current_ts + expire

    token = RtcTokenBuilder.buildTokenWithUid(
        app_id, app_certificate, channel, uid, role, privilege_expired_ts
    )
    return JsonResponse({'token': token})


@login_required
def end_livestream(request, room_name):
    """Завершение трансляции"""
    room = get_object_or_404(LivestreamRoom, name=room_name, is_active=True)

    # Только ведущий или админ может завершить трансляцию
    if request.user != room.host and not request.user.is_superuser and getattr(request.user, 'role', '') != 'admin':
        return HttpResponseForbidden("У вас нет прав для завершения этой трансляции")

    room.is_active = False
    room.save()

    messages.success(request, f"Трансляция завершена")
    return redirect('livestream_list')
