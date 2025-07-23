import re
import io
import os
import tempfile
import requests
import hashlib
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, JsonResponse
from django.core.paginator import Paginator
from django.template.loader import render_to_string
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from .forms import ArticleForm
from .models import Article
from gtts import gTTS
from docx import Document


def article_list(request):
    """
    Список всех статей с поиском, фильтрацией по дате и ленивой загрузкой
    """
    search_query = request.GET.get('q', '')
    date_from = request.GET.get('date_from', '')
    date_to = request.GET.get('date_to', '')
    page = request.GET.get('page', 1)

    # Базовый запрос
    if request.user.is_authenticated:
        articles = (Article.objects.filter(is_approved=True) |
                    Article.objects.filter(author=request.user)).distinct()
    else:
        articles = Article.objects.filter(is_approved=True)

    # Применяем фильтры
    if search_query:
        articles = articles.filter(title__icontains=search_query)

    if date_from:
        articles = articles.filter(created_at__gte=date_from)

    if date_to:
        articles = articles.filter(created_at__lte=date_to)

    # Сортировка
    articles = articles.order_by('-created_at')

    # Пагинация
    paginator = Paginator(articles, 6)  # 6 статей на страницу
    page_obj = paginator.get_page(page)

    # Для AJAX-запросов возвращаем только HTML карточек
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        html = render_to_string(
            'articles/includes/article_cards.html',
            {'articles': page_obj}
        )
        return JsonResponse({
            'html': html,
            'has_next': page_obj.has_next()
        })

    # Для обычных запросов возвращаем полную страницу
    return render(request, 'articles/list.html', {
        'articles': page_obj,
        'search_query': search_query,
        'date_from': date_from,
        'date_to': date_to
    })


def article_detail(request, pk):
    """
    Детальный просмотр статьи с проверкой доступа к неопубликованным
    """
    article = get_object_or_404(Article, pk=pk)

    if not article.is_approved:
        if not request.user.is_authenticated or (
            request.user != article.author and
            getattr(request.user, 'role', '') != 'admin' and
            not request.user.is_superuser
        ):
            return render(request, 'core/403.html', status=403)

    return render(request, 'articles/detail.html', {'article': article})


@login_required
def article_create(request):
    """
    Создание новой статьи:
    - поддержка ввода вручную
    - загрузка файлов (.txt, .docx, .pdf)
    - автоматическое одобрение привилегированным и админам
    """
    if not (getattr(request.user, 'role', '') in ['registered', 'privileged', 'admin'] or request.user.is_superuser):
        return render(request, 'core/403.html', status=403)

    form = ArticleForm(request.POST or None, request.FILES or None)

    if request.method == 'POST' and form.is_valid():
        article = form.save(commit=False)
        article.author = request.user

        if getattr(request.user, 'role', '') in ['privileged', 'admin'] or request.user.is_superuser:
            article.is_approved = True

        article.save()

        # 🔄 Обработка файла (если есть)
        extract_text_from_file(article)

        return redirect('article_detail', pk=article.pk)

    return render(request, 'admin_panel/article_form.html', {'form': form})


def extract_text_from_file(article):
    """
    Извлекает текст из файла (txt, docx) и сохраняет его в поле `text`.
    """
    if not article.uploaded_file:
        return

    ext = os.path.splitext(article.uploaded_file.name)[1].lower()
    filepath = article.uploaded_file.path
    text = ""

    try:
        if ext == '.txt':
            with open(filepath, 'r', encoding='utf-8') as f:
                text = f.read()
        elif ext == '.docx':
            doc = Document(filepath)
            text = '\n'.join([p.text for p in doc.paragraphs])
        else:
            print("[!] Нераспознаваемый тип файла:", ext)
            return
    except Exception as e:
        print(f"[!] Ошибка при извлечении текста из файла: {e}")
        return

    if text:
        # Преобразуем текст в HTML-формат для CKEditor
        # Разбиваем на абзацы и оборачиваем каждый в <p>
        paragraphs = text.split('\n\n')
        html_paragraphs = []

        for p in paragraphs:
            if p.strip():  # Пропускаем пустые абзацы
                html_p = p.replace('\n', '<br>')
                html_paragraphs.append(f'<p>{html_p}</p>')

        html_text = ''.join(html_paragraphs)
        article.text = html_text
        article.save()


@csrf_exempt
def process_file(request):
    """
    Обрабатывает загруженный файл и возвращает извлеченный текст.
    Поддерживаются только .txt и .docx форматы.
    """
    if request.method != 'POST' or 'file' not in request.FILES:
        return JsonResponse({'error': 'No file provided'}, status=400)

    uploaded_file = request.FILES['file']
    ext = os.path.splitext(uploaded_file.name)[1].lower()
    text = ""

    try:
        if ext == '.txt':
            text = uploaded_file.read().decode('utf-8')
        elif ext == '.docx':
            # Сохраняем файл временно
            temp_path = os.path.join('media', 'temp', uploaded_file.name)
            os.makedirs(os.path.dirname(temp_path), exist_ok=True)

            with open(temp_path, 'wb+') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)

            # Извлекаем текст
            doc = Document(temp_path)
            text = '\n'.join([p.text for p in doc.paragraphs])

            # Удаляем временный файл
            os.remove(temp_path)
        else:
            return JsonResponse({'error': 'Unsupported file format. Only .txt and .docx are supported.'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

    # Преобразуем текст в HTML
    paragraphs = text.split('\n\n')
    html_paragraphs = []

    for p in paragraphs:
        if p.strip():  # Пропускаем пустые абзацы
            html_p = p.replace('\n', '<br>')
            html_paragraphs.append(f'<p>{html_p}</p>')

    html_text = ''.join(html_paragraphs)

    return JsonResponse({'text': html_text})


@login_required
def generate_audio_armtts(request, pk):
    """
    Генерирует аудио-версию статьи с использованием ArmTTS через RapidAPI
    """
    article = get_object_or_404(Article, pk=pk)

    if not article.text:
        return HttpResponse("Нет текста для озвучивания", status=400)

    # Очищаем HTML-теги для получения чистого текста
    clean_text = re.sub(r'<.*?>', ' ', article.text)
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()

    # Ограничиваем длину текста, если он слишком большой
    if len(clean_text) > 1000:
        clean_text = clean_text[:1000]

    # Проверяем язык статьи
    if article.language == 'hy':
        # Для армянского языка используем ArmTTS через RapidAPI
        url = "https://armtts1.p.rapidapi.com/v3/synthesize"

        payload = {
            "text": clean_text,
            "voice": "male"  # или "female", если доступно
        }

        headers = {
            "content-type": "application/json",
            "X-RapidAPI-Key": "a6da876895msha42d73d5b3f58b2p107cd5jsn8be0d03bce46",
            "X-RapidAPI-Host": "armtts1.p.rapidapi.com"
        }

        try:
            response = requests.post(url, json=payload, headers=headers)

            if response.status_code != 200:
                return HttpResponse(f"Ошибка API: {response.status_code} - {response.text}", status=500)

            # Предполагаем, что API возвращает аудио в формате MP3 или WAV
            # Проверяем заголовок Content-Type
            content_type = response.headers.get('Content-Type', '')

            if 'audio' in content_type:
                # Если API возвращает аудио напрямую
                return HttpResponse(response.content, content_type=content_type)
            else:
                # Если API возвращает URL или другие данные
                data = response.json()

                if 'audio_url' in data:
                    # Если API возвращает URL аудио, скачиваем его
                    audio_url = data['audio_url']
                    audio_response = requests.get(audio_url)
                    return HttpResponse(audio_response.content, content_type='audio/mpeg')
                elif 'audio_base64' in data:
                    # Если API возвращает аудио в формате base64
                    import base64
                    audio_data = base64.b64decode(data['audio_base64'])
                    return HttpResponse(audio_data, content_type='audio/mpeg')
                else:
                    return HttpResponse("Неподдерживаемый формат ответа от API", status=500)

        except Exception as e:
            return HttpResponse(f"Ошибка при генерации аудио: {str(e)}", status=500)
    else:
        # Для других языков используем gTTS
        from gtts import gTTS
        import io

        try:
            tts = gTTS(text=clean_text, lang=article.language)
            mp3_fp = io.BytesIO()
            tts.write_to_fp(mp3_fp)
            mp3_fp.seek(0)

            return HttpResponse(mp3_fp.read(), content_type='audio/mpeg')
        except Exception as e:
            return HttpResponse(f"Ошибка при генерации аудио: {str(e)}", status=500)
