from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponseForbidden
from django.contrib import messages
from .models import LivestreamRoom, LivestreamParticipant, LivestreamChatMessage, LivestreamInvite
from .forms import LivestreamRoomForm
from apps.core.models import SiteSettings
from django.contrib.auth import get_user_model
from django.views.decorators.http import require_POST
from django.utils.timesince import timesince
import time
import random
import string
from agora_token_builder import RtcTokenBuilder

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
    part, created = LivestreamParticipant.objects.get_or_create(
        room=room, user=request.user)
    if part.is_kicked and not part.waiting_approval:
        part.waiting_approval = True
        part.save()
        return render(request, 'livestream/kicked.html', {'room': room})
    if part.waiting_approval and not is_host:
        return render(request, 'livestream/waiting_approval.html', {'room': room})
    if room.platform == 'agora':
        app_id = SiteSettings.get_setting('AGORA_APP_ID')
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
    participants = LivestreamParticipant.objects.filter(
        room=room, is_kicked=False)
    waiting = LivestreamParticipant.objects.filter(
        room=room, waiting_approval=True)
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
def livestream_invite(request, room_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)
    if request.user != room.host:
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
    if request.user != room.host:
        return JsonResponse({'error': 'Нет прав'}, status=403)
    part = LivestreamParticipant.objects.filter(
        room=room, user_id=user_id).first()
    if part:
        part.is_kicked = True
        part.waiting_approval = False
        part.save()
    return JsonResponse({'ok': True})


@require_POST
@login_required
def livestream_approve(request, room_id, user_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)
    if request.user != room.host:
        return JsonResponse({'error': 'Нет прав'}, status=403)
    part = LivestreamParticipant.objects.filter(
        room=room, user_id=user_id).first()
    if part:
        part.is_kicked = False
        part.waiting_approval = False
        part.save()
    return JsonResponse({'ok': True})


@require_POST
@login_required
def livestream_mute(request, room_id, user_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)
    if request.user != room.host:
        return JsonResponse({'error': 'Нет прав'}, status=403)
    p = LivestreamParticipant.objects.filter(
        room=room, user_id=user_id).first()
    if p:
        p.is_muted = not p.is_muted
        p.save()
    return JsonResponse({'ok': True})


@require_POST
@login_required
def livestream_grant(request, room_id, user_id):
    room = get_object_or_404(LivestreamRoom, id=room_id, is_active=True)
    if request.user != room.host:
        return JsonResponse({'error': 'Нет прав'}, status=403)
    LivestreamParticipant.objects.filter(room=room).update(is_speaker=False)
    p = LivestreamParticipant.objects.filter(
        room=room, user_id=user_id).first()
    if p:
        p.is_speaker = not p.is_speaker
        p.save()
    return JsonResponse({'ok': True})
