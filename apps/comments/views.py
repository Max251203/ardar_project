from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.contrib import messages
from .models import Comment, Rating
from .forms import CommentForm, RatingForm
from apps.articles.models import Article
from django.db import models


@login_required
def add_comment(request, article_id):
    article = get_object_or_404(Article, id=article_id)

    # Проверяем, есть ли уже комментарий от этого пользователя
    existing_comment = Comment.objects.filter(
        article=article, author=request.user).first()

    if request.method == 'POST':
        form = CommentForm(request.POST, instance=existing_comment)
        if form.is_valid():
            comment = form.save(commit=False)
            comment.article = article
            comment.author = request.user
            comment.save()
            messages.success(request, "Комментарий добавлен")
            return redirect('article_detail', pk=article_id)
    else:
        form = CommentForm(instance=existing_comment)

    return render(request, 'comments/add_comment.html', {
        'form': form,
        'article': article,
        'existing_comment': existing_comment
    })


@login_required
def edit_comment(request, comment_id):
    comment = get_object_or_404(Comment, id=comment_id, author=request.user)

    if request.method == 'POST':
        form = CommentForm(request.POST, instance=comment)
        if form.is_valid():
            form.save()
            messages.success(request, "Комментарий обновлен")
            return redirect('article_detail', pk=comment.article.id)
    else:
        form = CommentForm(instance=comment)

    return render(request, 'comments/edit_comment.html', {
        'form': form,
        'comment': comment
    })


@login_required
def delete_comment(request, comment_id):
    comment = get_object_or_404(Comment, id=comment_id, author=request.user)
    article_id = comment.article.id

    if request.method == 'POST':
        comment.delete()
        messages.success(request, "Комментарий удален")
        return redirect('article_detail', pk=article_id)

    return render(request, 'comments/delete_comment.html', {
        'comment': comment
    })


@login_required
def rate_article(request, article_id):
    article = get_object_or_404(Article, id=article_id)

    # Проверяем, есть ли уже оценка от этого пользователя
    rating, created = Rating.objects.get_or_create(
        article=article,
        user=request.user,
        defaults={'value': 0}
    )

    if request.method == 'POST':
        form = RatingForm(request.POST, instance=rating)
        if form.is_valid():
            form.save()

            # Пересчитываем средний рейтинг статьи
            avg_rating = Rating.objects.filter(article=article).aggregate(
                models.Avg('value'))['value__avg']

            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({
                    'success': True,
                    'avg_rating': avg_rating,
                    'rating_count': Rating.objects.filter(article=article).count()
                })

            messages.success(request, "Ваша оценка сохранена")
            return redirect('article_detail', pk=article_id)
    else:
        form = RatingForm(instance=rating)

    return render(request, 'comments/rate_article.html', {
        'form': form,
        'article': article,
        'rating': rating
    })
