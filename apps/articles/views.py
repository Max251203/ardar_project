from django.http import HttpResponse, JsonResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404
import logging
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
    Список всех статей с поиском, фильтрацией по дате и языку, и ленивой загрузкой
    """
    search_query = request.GET.get('q', '')
    date_from = request.GET.get('date_from', '')
    date_to = request.GET.get('date_to', '')
    language = request.GET.get('language', '')  # Новый параметр
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

    # Фильтр по языку
    if language:
        articles = articles.filter(language=language)

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
        'date_to': date_to,
        'language': language  # Передаем выбранный язык в шаблон
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

        # Обработка загруженного изображения
        if 'image' in request.FILES:
            image_file = request.FILES['image']
            # Читаем данные изображения
            article.image_data = image_file.read()
            article.image_name = image_file.name
            article.image_type = image_file.content_type

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


# Получаем логгер
logger = logging.getLogger(__name__)


@login_required
def generate_audio_armtts(request, pk):
    """
    Генерирует аудио-версию статьи с использованием ArmTTS через RapidAPI
    """
    article = get_object_or_404(Article, pk=pk)

    if not article.text:
        logger.warning(f"Статья {pk} не содержит текста для озвучивания")
        return HttpResponse("Нет текста для озвучивания", status=400)

    # Очищаем HTML-теги для получения чистого текста
    clean_text = re.sub(r'<.*?>', ' ', article.text)
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()

    # Ограничиваем длину текста, если он слишком большой
    if len(clean_text) > 1000:
        clean_text = clean_text[:1000]
        logger.info(f"Текст статьи {pk} был обрезан до 1000 символов")

    # Проверяем язык статьи
    article_language = article.language
    logger.info(f"Озвучка статьи {pk} на языке: {article_language}")

    # Используем ArmTTS API для всех языков
    try:
        # Используем RapidAPI для ArmTTS
        url = "https://armtts1.p.rapidapi.com/tts"

        payload = {
            "text": clean_text,
            "voice": "male"
        }

        headers = {
            "content-type": "application/json",
            "X-RapidAPI-Key": "a6da876895msha42d73d5b3f58b2p107cd5jsn8be0d03bce46",
            "X-RapidAPI-Host": "armtts1.p.rapidapi.com"
        }

        logger.info(f"Отправка запроса к ArmTTS API: {url}")
        logger.debug(f"Payload: {payload}")

        response = requests.post(url, json=payload, headers=headers)

        logger.info(f"Статус ответа: {response.status_code}")

        if response.status_code != 200:
            error_text = f"Ошибка API: {response.status_code}"
            try:
                error_text += f" - {response.text}"
            except:
                pass
            logger.error(f"Ошибка API: {error_text}")
            return HttpResponse(error_text, status=500)

        # Если ответ успешный, возвращаем аудио
        logger.info("Успешный ответ от ArmTTS API")
        return HttpResponse(response.content, content_type='audio/mpeg')

    except Exception as e:
        logger.error(f"Исключение при запросе к API: {str(e)}")
        return HttpResponse(f"Ошибка при генерации аудио: {str(e)}", status=500)


@login_required
def get_article_image(request, pk):
    """
    Возвращает изображение статьи из БД
    """
    article = get_object_or_404(Article, pk=pk)

    if not article.image_data:
        return HttpResponse("Изображение не найдено", status=404)

    return HttpResponse(article.image_data, content_type=article.image_type)


@login_required
def remove_article_image(request, pk):
    """
    Удаляет изображение из статьи
    """
    article = get_object_or_404(Article, pk=pk)

    # Проверка прав доступа
    if not (request.user == article.author or
            getattr(request.user, 'role', '') == 'admin' or
            request.user.is_superuser):
        return HttpResponseForbidden()

    # Удаляем данные изображения
    article.image_data = None
    article.image_name = None
    article.image_type = None
    article.save()

    return JsonResponse({'success': True})
