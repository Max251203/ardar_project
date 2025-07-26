import hmac
import base64
import struct
import time
import zlib
from hashlib import sha256

# Константы для типов токенов
RTC_ROLE_PUBLISHER = 1  # Ведущий
RTC_ROLE_SUBSCRIBER = 2  # Зритель


def generate_rtc_token(app_id, app_certificate, channel_name, uid, role, expire_time_seconds):
    """
    Генерирует токен для Agora RTC (Real-Time Communication)

    Args:
        app_id (str): Agora App ID
        app_certificate (str): Agora App Certificate
        channel_name (str): Название канала
        uid (int): ID пользователя
        role (int): Роль пользователя (1 - publisher, 2 - subscriber)
        expire_time_seconds (int): Время жизни токена в секундах

    Returns:
        str: Токен для подключения к Agora
    """
    # Текущее время в секундах (UTC)
    current_timestamp = int(time.time())
    # Время истечения токена
    expire_timestamp = current_timestamp + expire_time_seconds

    # Создаем токен с информацией о канале и пользователе
    token_info = {
        "app_id": app_id,
        "channel_name": channel_name,
        "uid": str(uid),
        "role": role,
        "privilege": {
            "1": expire_timestamp,  # Привилегия на присоединение к каналу
            # Привилегия на публикацию аудио/видео
            "2": expire_timestamp if role == RTC_ROLE_PUBLISHER else 0
        }
    }

    # Сериализуем информацию о токене в строку
    token_info_str = str(token_info)

    # Создаем подпись с использованием HMAC-SHA256
    signature = hmac.new(
        app_certificate.encode('utf-8'),
        token_info_str.encode('utf-8'),
        sha256
    ).digest()

    # Кодируем информацию о токене и подпись в base64
    token_info_b64 = base64.b64encode(
        token_info_str.encode('utf-8')).decode('utf-8')
    signature_b64 = base64.b64encode(signature).decode('utf-8')

    # Формируем итоговый токен
    token = f"{app_id}.{token_info_b64}.{signature_b64}.{current_timestamp}.{expire_timestamp}"

    return token
