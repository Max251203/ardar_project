from django.db import models
from django.conf import settings


class LivestreamRoom(models.Model):
    name = models.CharField(max_length=200, verbose_name="Название трансляции")
    channel_id = models.CharField(
        max_length=64, unique=True, verbose_name="Channel ID (латиница/цифры)")
    host = models.ForeignKey(settings.AUTH_USER_MODEL,
                             on_delete=models.CASCADE)
    description = models.TextField(blank=True, null=True)
    started_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name}"


class LivestreamParticipant(models.Model):
    room = models.ForeignKey(
        LivestreamRoom, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey(settings.AUTH_USER_MODEL,
                             on_delete=models.CASCADE)
    joined_at = models.DateTimeField(auto_now_add=True)
    is_muted = models.BooleanField(default=False)
    is_speaker = models.BooleanField(default=False)
    is_kicked = models.BooleanField(default=False)
    waiting_approval = models.BooleanField(default=False)
    # Новые поля для управления правами
    can_enable_mic = models.BooleanField(default=True)
    can_enable_camera = models.BooleanField(default=True)
    # Для "поднять руку"
    hand_raised = models.BooleanField(default=False)


class LivestreamChatMessage(models.Model):
    room = models.ForeignKey(
        LivestreamRoom, on_delete=models.CASCADE, related_name='chat_messages')
    user = models.ForeignKey(settings.AUTH_USER_MODEL,
                             on_delete=models.CASCADE)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class LivestreamInvite(models.Model):
    room = models.ForeignKey(
        LivestreamRoom, on_delete=models.CASCADE, related_name='invites')
    invited_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='livestream_invites')
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='livestream_sent_invites')
    created_at = models.DateTimeField(auto_now_add=True)
    accepted = models.BooleanField(default=False)