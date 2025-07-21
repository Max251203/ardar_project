from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import re
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from .forms import ArticleForm
from .models import Article
from gtts import gTTS
from django.conf import settings
import os
from docx import Document
import textract
from django.http import HttpResponse
import io


def article_list(request):
    """
    Список всех статей:
    - если пользователь аутентифицирован, он видит свои черновики
    - остальные видят только одобренные статьи
    """
    if request.user.is_authenticated:
        articles = (Article.objects.filter(is_approved=True) |
                    Article.objects.filter(author=request.user)).distinct().order_by('-created_at')
    else:
        articles = Article.objects.filter(
            is_approved=True).order_by('-created_at')

    return render(request, 'articles/list.html', {'articles': articles})


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
def generate_audio(request, pk):
    article = get_object_or_404(Article, pk=pk)

    if not article.text:
        return HttpResponse("Нет текста для озвучивания", status=400)

    # Очищаем HTML-теги для получения чистого текста
    clean_text = re.sub(r'<.*?>', ' ', article.text)
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()

    # Генерируем аудио без сохранения
    tts = gTTS(text=clean_text, lang=article.language)
    buffer = io.BytesIO()
    tts.write_to_fp(buffer)
    buffer.seek(0)

    # Отправляем аудио как поток
    response = HttpResponse(buffer.read(), content_type="audio/mpeg")
    response['Content-Disposition'] = f'inline; filename=article_{article.pk}.mp3'
    return response
