# apps/articles/utils.py
import os
import requests
import tempfile
from gtts import gTTS


def generate_tts_for_text(text, language, api_key=None):
    """
    Генерирует аудиофайл для текста используя разные TTS-сервисы в зависимости от языка
    """
    if not text:
        return None, "Текст пустой"

    # Максимальный размер текста для синтеза
    max_text_length = 2000
    if len(text) > max_text_length:
        text = text[:max_text_length]

    try:
        # Для армянского языка используем ArmTTS API
        if language == 'hy':
            return generate_armtts(text, api_key)
        # Для других языков используем Google TTS
        else:
            return generate_gtts(text, language)
    except Exception as e:
        return None, str(e)


def generate_armtts(text, api_key=None):
    """Генерирует аудио для армянского текста через ArmTTS API"""
    try:
        api_url = "https://armtts1.p.rapidapi.com/synthesize"
        headers = {
            "content-type": "application/json",
            "X-RapidAPI-Key": api_key or "1e8d32c7c3msh767635ff925bcd7p13000fjsn07bbb0ccda3f",
            "X-RapidAPI-Host": "armtts1.p.rapidapi.com"
        }
        payload = {
            "text": text,
            "voice": "male"
        }

        response = requests.post(api_url, json=payload, headers=headers)

        if response.status_code == 200:
            # Сохраняем временный файл
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_file:
                tmp_file.write(response.content)
                tmp_path = tmp_file.name

            return tmp_path, None
        else:
            # Если ArmTTS не работает, пробуем использовать gTTS как запасной вариант
            return generate_gtts(text, 'hy')
    except Exception as e:
        return None, f"Ошибка ArmTTS API: {str(e)}"


def generate_gtts(text, language):
    """Генерирует аудио через Google Text-to-Speech"""
    try:
        # Маппинг языковых кодов для gTTS
        language_map = {
            'ru': 'ru',
            'en': 'en',
            'hy': 'hy'  # Проверьте, поддерживается ли армянский в gTTS
        }

        lang_code = language_map.get(language, 'en')

        # Создаем TTS объект
        tts = gTTS(text=text, lang=lang_code, slow=False)

        # Сохраняем во временный файл
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_file:
            tts.save(tmp_file.name)
            tmp_path = tmp_file.name

        return tmp_path, None
    except Exception as e:
        return None, f"Ошибка Google TTS: {str(e)}"
