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
    Чтение загруженного файла и запись его содержимого в поле `text`
    (поддерживаются: .txt, .docx, .pdf)
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
        elif ext == '.pdf':
            text = textract.process(filepath).decode('utf-8')
        else:
            print(f"[SKIP] Unsupported file type: {ext}")
            return
    except Exception as e:
        print(f"[ERROR] Failed to extract text from file: {e}")
        return

    if text:
        article.text = text
        article.save()


@login_required
def generate_audio(request, pk):
    article = get_object_or_404(Article, pk=pk)

    if not article.text:
        return HttpResponse("Нет текста для озвучивания", status=400)

    # Генерируем аудио без сохранения
    tts = gTTS(text=article.text, lang=article.language)
    buffer = io.BytesIO()
    tts.write_to_fp(buffer)
    buffer.seek(0)

    # Отправляем аудио как поток
    response = HttpResponse(buffer.read(), content_type="audio/mpeg")
    response['Content-Disposition'] = f'inline; filename=article_{article.pk}.mp3'
    return response
