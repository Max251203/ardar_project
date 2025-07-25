from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponseForbidden
from django.contrib import messages
from django.views.decorators.http import require_POST
from django.contrib.auth import get_user_model
from .models import LivestreamRoom, LivestreamParticipant, LivestreamChatMessage, LivestreamInvite
from apps.core.models import SiteSettings
import time
from agora_token_builder import RtcTokenBuilder
import random
import string
from .forms import LivestreamRoomForm
from django.utils.timesince import timesince

User = get_user_model()


def generate_channel_id():
    return 'ardar-' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))


@login_required
def livestream_list(request):
    rooms = LivestreamRoom.objects.filter(
        is_active=True).order_by('-started_at')
    return render(request, 'livestream/list.html', {'rooms': rooms})


@login_required
def livestream_list_ajax(request):
    rooms = LivestreamRoom.objects.filter(
        is_active=True).order_by('-started_at')
    data = []
    for room in rooms:
        data.append({
            'id': room.id,
            'name': room.name,
            'platform': room.get_platform_display(),
            'host': room.host.name,
            'started_at': room.started_at.strftime('%d.%m.%Y %H:%M'),
            'description': room.description,
        })
    return JsonResponse({'rooms': data})


@login_required
def create_livestream(request):
    if not (request.user.is_superuser or getattr(request.user, 'role', '') in ['admin', 'privileged']):
        messages.error(request, "У вас нет прав для создания трансляций")
        return redirect('livestream_list')
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


@login_required
def livestream_room(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)
    is_host = (request.user == room.host)

    # Проверяем, не исключен ли пользователь
    participant, created = LivestreamParticipant.objects.get_or_create(
        room=room, user=request.user
    )

    # Если пользователь исключен и не ожидает одобрения, устанавливаем флаг ожидания
    if participant.is_kicked and not participant.waiting_approval:
        participant.waiting_approval = True
        participant.save()

    # Если пользователь ведущий, он всегда может войти
    if is_host:
        participant.waiting_approval = False
        participant.is_kicked = False
        participant.save()

    # Если пользователь ожидает одобрения и не ведущий, показываем страницу ожидания
    if participant.waiting_approval and not is_host:
        return render(request, 'livestream/waiting_approval.html', {'room': room})

    app_id = SiteSettings.get_setting('AGORA_APP_ID')

    if room.platform == 'agora':
        return render(request, 'livestream/room_agora.html', {
            'room': room,
            'app_id': app_id,
            'channel_id': room.channel_id,
            'is_host': is_host,
            'user_id': str(request.user.id),
            'user_name': request.user.name
        })
    else:
        return render(request, 'livestream/room_jitsi.html', {
            'room': room,
            'is_host': is_host,
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
def end_livestream(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)
    if request.user != room.host and not request.user.is_superuser and getattr(request.user, 'role', '') != 'admin':
        return HttpResponseForbidden("У вас нет прав для завершения этой трансляции")
    room.is_active = False
    room.save()
    messages.success(request, f"Трансляция завершена")
    return redirect('livestream_list')


@login_required
def livestream_chat(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)
    if request.method == 'GET':
        messages_qs = LivestreamChatMessage.objects.filter(
            room=room).select_related('user').order_by('-created_at')[:50]
        messages_list = [
            {
                'user': msg.user.name,
                'text': msg.text,
                'created': timesince(msg.created_at) + ' назад'
            }
            for msg in reversed(messages_qs)
        ]
        return JsonResponse({'messages': messages_list})
    elif request.method == 'POST':
        text = request.POST.get('text', '').strip()
        if text:
            msg = LivestreamChatMessage.objects.create(
                room=room, user=request.user, text=text)
            return JsonResponse({
                'user': msg.user.name,
                'text': msg.text,
                'created': timesince(msg.created_at) + ' назад'
            })
        return JsonResponse({'error': 'Пустое сообщение'}, status=400)


@login_required
def livestream_users(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)

    # Получаем активных участников (не исключенных)
    participants = LivestreamParticipant.objects.filter(
        room=room, is_kicked=False, waiting_approval=False
    ).select_related('user')

    # Получаем ожидающих одобрения
    waiting = LivestreamParticipant.objects.filter(
        room=room, waiting_approval=True
    ).select_related('user')

    users = []
    for p in participants:
        users.append({
            'id': p.user.id,
            'name': p.user.name,
            'is_muted': p.is_muted,
            'is_speaker': p.is_speaker,
            'is_host': p.user == room.host,
        })

    waiting_list = []
    for p in waiting:
        waiting_list.append({'id': p.user.id, 'name': p.user.name})

    return JsonResponse({'users': users, 'waiting': waiting_list})


@login_required
def check_user_status(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id)

    # Проверяем статус пользователя
    participant, created = LivestreamParticipant.objects.get_or_create(
        room=room, user=request.user
    )

    # Проверяем, завершена ли трансляция
    room_ended = not room.is_active

    return JsonResponse({
        'is_kicked': participant.is_kicked,
        'waiting_approval': participant.waiting_approval,
        'approved': not participant.is_kicked and not participant.waiting_approval,
        'room_ended': room_ended,
        # Добавляем временную метку для предотвращения кэширования
        'timestamp': int(time.time())
    })


@require_POST
@login_required
def livestream_invite(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)

    # Проверяем, что запрос от ведущего
    if request.user != room.host and not request.user.is_superuser:
        return JsonResponse({'error': 'Нет прав'}, status=403)

    if request.method == 'POST':
        user_id = int(request.POST.get('user_id'))
        user = User.objects.get(id=user_id)
        LivestreamInvite.objects.get_or_create(
            room=room, invited_user=user, invited_by=request.user)
        return JsonResponse({'ok': True})

    q = request.GET.get('q', '')
    users = User.objects.filter(name__icontains=q).exclude(
        id__in=LivestreamParticipant.objects.filter(room=room).values('user_id'))[:10]
    return JsonResponse({'results': [{'id': u.id, 'name': u.name} for u in users]})


@require_POST
@login_required
def livestream_kick(request, room_id, user_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)

    # Проверяем, что запрос от ведущего
    if request.user != room.host and not request.user.is_superuser:
        return JsonResponse({'error': 'Нет прав'}, status=403)

    # Находим участника
    participant = get_object_or_404(
        LivestreamParticipant, room=room, user_id=user_id)

    # Исключаем участника
    participant.is_kicked = True
    participant.waiting_approval = False
    participant.is_speaker = False  # Убираем статус спикера при исключении
    participant.save()

    return JsonResponse({'success': True})


@require_POST
@login_required
def livestream_approve(request, room_id, user_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)

    # Проверяем, что запрос от ведущего
    if request.user != room.host and not request.user.is_superuser:
        return JsonResponse({'error': 'Нет прав'}, status=403)

    # Находим участника
    participant = get_object_or_404(
        LivestreamParticipant, room=room, user_id=user_id)

    # Одобряем участника
    participant.is_kicked = False
    participant.waiting_approval = False
    participant.save()

    return JsonResponse({'success': True})


@require_POST
@login_required
def livestream_mute(request, room_id, user_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)

    # Проверяем, что запрос от ведущего
    if request.user != room.host and not request.user.is_superuser:
        return JsonResponse({'error': 'Нет прав'}, status=403)

    # Находим участника
    participant = get_object_or_404(
        LivestreamParticipant, room=room, user_id=user_id)

    # Меняем статус микрофона
    participant.is_muted = not participant.is_muted
    participant.save()

    return JsonResponse({'success': True})


@require_POST
@login_required
def livestream_grant(request, room_id, user_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)

    # Проверяем, что запрос от ведущего или от самого пользователя (для возврата слова)
    if request.user != room.host and request.user.id != user_id and not request.user.is_superuser:
        return JsonResponse({'error': 'Нет прав'}, status=403)

    # Если пользователь возвращает слово сам
    if request.user.id == user_id:
        participant = get_object_or_404(
            LivestreamParticipant, room=room, user=request.user)
        participant.is_speaker = False
        participant.save()
        return JsonResponse({'success': True})

    # Если ведущий дает или забирает слово
    participant = get_object_or_404(
        LivestreamParticipant, room=room, user_id=user_id)

    # Если пользователь уже спикер, забираем слово
    if participant.is_speaker:
        participant.is_speaker = False
    else:
        # Сначала убираем статус спикера у всех остальных
        LivestreamParticipant.objects.filter(
            room=room).update(is_speaker=False)
        # Затем даем слово выбранному пользователю
        participant.is_speaker = True

    participant.save()

    return JsonResponse({'success': True})
