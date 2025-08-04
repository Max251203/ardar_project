import time
import random
import string

from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponseForbidden, HttpResponseBadRequest
from django.contrib.auth.decorators import login_required
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.contrib import messages
from django.views.decorators.http import require_POST

from django.utils.timesince import timesince
from django.utils.timezone import now
from django.conf import settings

from .models import (
    LivestreamRoom,
    LivestreamParticipant,
    LivestreamChatMessage,
    LivestreamInvite,
)
from .forms import LivestreamRoomForm
from apps.core.models import SiteSettings

from agora_token_builder import RtcTokenBuilder
from agora_token_builder import RtmTokenBuilder

User = get_user_model()


def generate_channel_id():
    return 'ardar-' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))

# RTC Token for Agora
@login_required
def generate_token(request):
    app_id = settings.AGORA_APP_ID
    app_certificate = settings.AGORA_APP_CERTIFICATE
    channel_name = request.GET.get('channel')
    uid = int(request.GET.get('uid', 0))
    role = int(request.GET.get('role', 1))

    if not channel_name or not uid:
        return HttpResponseBadRequest("Missing parameters")

    expire_time = int(getattr(settings, 'AGORA_TOKEN_EXPIRE', 3600))
    current_ts = int(time.time())
    privilege_expired_ts = current_ts + expire_time

    token = RtcTokenBuilder.buildTokenWithUid(
        app_id, app_certificate, channel_name, uid, role, privilege_expired_ts)

    return JsonResponse({'token': token})


# Список трансляций
@login_required
def livestream_list(request):
    rooms = LivestreamRoom.objects.filter(is_active=True).order_by('-started_at')
    return render(request, 'livestream/list.html', {'rooms': rooms})


@login_required
def livestream_list_ajax(request):
    rooms = LivestreamRoom.objects.filter(is_active=True).order_by('-started_at')
    data = []
    for room in rooms:
        data.append({
            'id': room.id,
            'name': room.name,
            'host': room.host.name,
            'host_id': room.host.id,
            'started_at': room.started_at.strftime('%d.%m.%Y %H:%M'),
            'description': room.description,
            'can_end': request.user.is_superuser or request.user == room.host or getattr(request.user, 'role', '') == 'admin'
        })
    return JsonResponse({'rooms': data})


# Создание комнаты
@login_required
def create_livestream(request):
    if not (request.user.is_superuser or getattr(request.user, 'role', '') in ['admin', 'privileged']):
        raise PermissionDenied("Недостаточно прав")
    if request.method == 'POST':
        form = LivestreamRoomForm(request.POST)
        if form.is_valid():
            room = form.save(commit=False)
            room.host = request.user
            room.channel_id = generate_channel_id()
            room.save()
            return redirect('livestream_room', room_id=room.id)
    else:
        form = LivestreamRoomForm()
    return render(request, 'livestream/create.html', {'form': form})


# Вход в комнату
@login_required
def livestream_room(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)
    is_host = request.user == room.host

    participant, created = LivestreamParticipant.objects.get_or_create(
        room=room, user=request.user,
        defaults={
            'is_muted': False,
            'is_speaker': is_host,
            'is_kicked': False,
            'waiting_approval': False,
            'can_enable_mic': True,
            'can_enable_camera': True,
            'hand_raised': False
        })

    if participant.is_kicked and not participant.waiting_approval:
        participant.waiting_approval = True
        participant.save()

    if is_host:
        participant.waiting_approval = False
        participant.is_kicked = False
        participant.save()

    if participant.waiting_approval and not is_host:
        return render(request, 'livestream/waiting_approval.html', {'room': room})

    return render(request, 'livestream/room_agora.html', {
        'room': room,
        'app_id': settings.AGORA_APP_ID,
        'channel_id': room.channel_id,
        'is_host': is_host,
        'user_id': request.user.id,
        'user_name': request.user.name,
    })


# Завершить трансляцию
@login_required
def end_livestream(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)
    if request.user != room.host and not request.user.is_superuser and getattr(request.user, 'role', '') != 'admin':
        raise PermissionDenied()
    
    room.is_active = False
    room.save()
    
    # Отправляем сигнал всем участникам о завершении трансляции через JavaScript
    messages.success(request, "Трансляция завершена.")
    return redirect('livestream_list')


# Чат
@login_required
def livestream_chat(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)

    if request.method == 'GET':
        messages_qs = LivestreamChatMessage.objects.filter(room=room)\
            .select_related('user')\
            .order_by('-created_at')[:50]
        data = [{
            'user': msg.user.name,
            'text': msg.text,
            'created': timesince(msg.created_at) + ' назад'
        } for msg in reversed(messages_qs)]
        return JsonResponse({'messages': data})

    if request.method == 'POST':
        text = request.POST.get('text', '').strip()
        if not text:
            return JsonResponse({'error': 'Пустое сообщение'}, status=400)
        msg = LivestreamChatMessage.objects.create(room=room, user=request.user, text=text)
        return JsonResponse({
            'user': msg.user.name,
            'text': msg.text,
            'created': timesince(msg.created_at) + ' назад'
        })


# Список пользователей в трансляции
@login_required
def livestream_users(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id)
    participants = LivestreamParticipant.objects.filter(room=room, is_kicked=False).select_related('user')
    waiting = LivestreamParticipant.objects.filter(room=room, waiting_approval=True).select_related('user')

    users = []
    for p in participants:
        users.append({
            'id': p.user.id,
            'name': p.user.name,
            'is_muted': p.is_muted,
            'is_speaker': p.is_speaker,
            'is_host': room.host_id == p.user.id,
            'can_enable_mic': p.can_enable_mic,
            'can_enable_camera': p.can_enable_camera,
            'hand_raised': p.hand_raised,
        })

    waiting_list = [{'id': u.user.id, 'name': u.user.name} for u in waiting]

    return JsonResponse({'users': users, 'waiting': waiting_list})


# Поднятие руки
@require_POST
@login_required
def livestream_raise_hand(request, room_id):
    participant = get_object_or_404(LivestreamParticipant, room_id=room_id, user=request.user)
    participant.hand_raised = True
    participant.save()
    return JsonResponse({'success': True})


# Сброс руки
@require_POST
@login_required
def livestream_lower_hand(request, room_id):
    participant = get_object_or_404(LivestreamParticipant, room_id=room_id, user=request.user)
    participant.hand_raised = False
    participant.save()
    return JsonResponse({'success': True})


# Проверка статуса пользователя
@login_required
def check_user_status(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id)
    participant = get_object_or_404(LivestreamParticipant, room=room, user=request.user)

    return JsonResponse({
        'is_kicked': participant.is_kicked,
        'waiting_approval': participant.waiting_approval,
        'room_ended': not room.is_active,
        'hand_raised': participant.hand_raised,
        'can_enable_mic': participant.can_enable_mic,
        'can_enable_camera': participant.can_enable_camera,
        'is_speaker': participant.is_speaker,
    })

@login_required
def generate_rtm_token(request):
    app_id = settings.AGORA_APP_ID
    app_certificate = settings.AGORA_APP_CERTIFICATE
    user_id = str(request.user.id)

    # Роль: 1 — Rtm_User (задаём вручную)
    role = 1

    expire_time_seconds = int(getattr(settings, 'AGORA_TOKEN_EXPIRE', 3600))
    current_ts = int(time.time())
    privilege_expired_ts = current_ts + expire_time_seconds

    token = RtmTokenBuilder.buildToken(
        app_id,
        app_certificate,
        user_id,
        role,
        privilege_expired_ts
    )

    return JsonResponse({'token': token})