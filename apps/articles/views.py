from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from .forms import ArticleForm
from .models import Article
from gtts import gTTS
from django.conf import settings
import os
from django.contrib.auth import get_user_model


def article_list(request):
    if request.user.is_authenticated:
        # Показываем все одобренные статьи + неодобренные статьи автора
        articles = (Article.objects.filter(is_approved=True) |
                    Article.objects.filter(author=request.user)).distinct().order_by('-created_at')
    else:
        # Для неавторизованных пользователей только одобренные статьи
        articles = Article.objects.filter(
            is_approved=True).order_by('-created_at')

    return render(request, 'articles/list.html', {'articles': articles})


def article_detail(request, pk):
    article = get_object_or_404(Article, pk=pk)

    # Если статья не одобрена, проверяем права доступа
    if not article.is_approved:
        # Только автор, админ или суперпользователь могут видеть неодобренные статьи
        if not request.user.is_authenticated or (
            request.user != article.author and
            request.user.role != 'admin' and
            not request.user.is_superuser
        ):
            return HttpResponseForbidden("Статья ожидает модерации и недоступна.")

    return render(request, 'articles/detail.html', {'article': article})


@login_required
def article_create(request):
    # Проверяем, что пользователь имеет право создавать статьи
    if not (request.user.role in ['registered', 'privileged', 'admin'] or request.user.is_superuser):
        return HttpResponseForbidden("У вас нет прав для создания статей")

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


# apps/articles/views.py (добавить в конец файла)

@login_required
def admin_dashboard(request):
    if not (request.user.role == 'admin' or request.user.is_superuser):
        return HttpResponseForbidden("У вас нет прав для доступа к админке")

    # Статистика
    total_articles = Article.objects.count()
    pending_articles = Article.objects.filter(is_approved=False).count()
    approved_articles = Article.objects.filter(is_approved=True).count()
    total_users = get_user_model().objects.count()

    context = {
        'total_articles': total_articles,
        'pending_articles': pending_articles,
        'approved_articles': approved_articles,
        'total_users': total_users,
    }

    return render(request, 'articles/admin/dashboard.html', context)


@login_required
def admin_articles(request):
    if not (request.user.role == 'admin' or request.user.is_superuser):
        return HttpResponseForbidden("У вас нет прав для доступа к админке")

    # Фильтрация
    status = request.GET.get('status', 'all')

    if status == 'pending':
        articles = Article.objects.filter(
            is_approved=False).order_by('-created_at')
    elif status == 'approved':
        articles = Article.objects.filter(
            is_approved=True).order_by('-created_at')
    else:
        articles = Article.objects.all().order_by('-created_at')

    context = {
        'articles': articles,
        'status': status,
    }

    return render(request, 'articles/admin/articles.html', context)


@login_required
def admin_users(request):
    if not (request.user.role == 'admin' or request.user.is_superuser):
        return HttpResponseForbidden("У вас нет прав для доступа к админке")

    users = get_user_model().objects.all().order_by('-date_joined')

    context = {
        'users': users,
    }

    return render(request, 'articles/admin/users.html', context)


@login_required
def admin_approve_article(request, pk):
    if not (request.user.role == 'admin' or request.user.is_superuser):
        return HttpResponseForbidden("У вас нет прав для модерации")

    article = get_object_or_404(Article, pk=pk)
    article.is_approved = True
    article.save()

    return redirect('admin_articles')


@login_required
def admin_reject_article(request, pk):
    if not (request.user.role == 'admin' or request.user.is_superuser):
        return HttpResponseForbidden("У вас нет прав для модерации")

    article = get_object_or_404(Article, pk=pk)
    article.delete()

    return redirect('admin_articles')


@login_required
def admin_change_role(request, user_id):
    if not (request.user.role == 'admin' or request.user.is_superuser):
        return HttpResponseForbidden("У вас нет прав для изменения ролей пользователей")

    user = get_object_or_404(get_user_model(), id=user_id)

    if request.method == 'POST':
        new_role = request.POST.get('role')
        if new_role in ['guest', 'registered', 'privileged', 'admin']:
            user.role = new_role
            user.save()
            return redirect('admin_users')

    return render(request, 'articles/admin/change_role.html', {'user': user})
