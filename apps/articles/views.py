from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from .forms import ArticleForm
from .models import Article
from gtts import gTTS
from django.conf import settings
import os


def article_list(request):
    if request.user.is_authenticated:
        # 👇 Объединяем QuerySet через `|` (OR)
        articles = (Article.objects.filter(is_approved=True)
                    | Article.objects.filter(author=request.user)).distinct()
    else:
        articles = Article.objects.filter(is_approved=True)

    return render(request, 'articles/list.html', {'articles': articles})


def article_detail(request, pk):
    article = get_object_or_404(Article, pk=pk)

    # Только автор или одобренная
    if not article.is_approved:
        if not request.user.is_authenticated or (
            request.user != article.author and not request.user.is_superuser
        ):
            return HttpResponseForbidden("Статья ещё не одобрена.")

    return render(request, 'articles/detail.html', {'article': article})


@login_required
def article_create(request):
    form = ArticleForm(request.POST or None, request.FILES or None)

    if request.method == 'POST' and form.is_valid():
        article = form.save(commit=False)
        article.author = request.user

        # Автоаппрув для привилегированных
        if request.user.role in ['privileged', 'admin'] or request.user.is_superuser:
            article.is_approved = True

        article.save()
        return redirect('article_detail', pk=article.pk)

    return render(request, 'articles/create.html', {'form': form})


@login_required
def generate_audio(request, pk):
    article = get_object_or_404(Article, pk=pk, author=request.user)

    if not article.audio:
        tts = gTTS(text=article.text, lang=article.language)
        filename = f'article_{article.pk}.mp3'
        filepath = os.path.join(settings.MEDIA_ROOT, 'tts', filename)

        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        tts.save(filepath)
        article.audio.name = f'tts/{filename}'
        article.save()

    return redirect('article_detail', pk=pk)


@login_required
def moderate_articles(request):
    # Только админы и суперпользователи могут модерировать
    if not (request.user.role == 'admin' or request.user.is_superuser):
        return HttpResponseForbidden("У вас нет прав для модерации статей")

    # Получаем все неодобренные статьи
    pending_articles = Article.objects.filter(
        is_approved=False).order_by('-created_at')
    return render(request, 'articles/moderate.html', {'articles': pending_articles})


@login_required
def approve_article(request, pk):
    if not (request.user.role == 'admin' or request.user.is_superuser):
        return HttpResponseForbidden("У вас нет прав для модерации статей")

    article = get_object_or_404(Article, pk=pk)
    article.is_approved = True
    article.save()
    return redirect('moderate_articles')


@login_required
def reject_article(request, pk):
    if not (request.user.role == 'admin' or request.user.is_superuser):
        return HttpResponseForbidden("У вас нет прав для модерации статей")

    article = get_object_or_404(Article, pk=pk)
    article.delete()  # Или можно добавить поле is_rejected и установить его в True
    return redirect('moderate_articles')
