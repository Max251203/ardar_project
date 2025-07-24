# apps/comments/views.py

from django.db.models import Avg
from django.contrib.auth.decorators import login_required, user_passes_test
from django.http import JsonResponse, HttpResponseBadRequest, HttpResponseForbidden
from django.views.decorators.http import require_POST, require_http_methods
from django.shortcuts import get_object_or_404
from .models import Comment, Rating
from apps.articles.models import Article


@login_required
@require_POST
def ajax_submit_comment(request, article_id):
    """
    Создание или обновление комментария
    """
    article = get_object_or_404(Article, pk=article_id)
    text = request.POST.get('text', '').strip()

    if not text:
        return JsonResponse({'error': 'Комментарий не может быть пустым'}, status=400)

    comment, created = Comment.objects.update_or_create(
        article=article,
        author=request.user,
        defaults={'text': text}
    )

    return JsonResponse({
        'id': comment.id,
        'text': comment.text,
        'author': comment.author.name,
        'date': comment.created_at.strftime('%d.%m.%Y %H:%M'),
        'is_owner': True  # текущий пользователь всегда "владелец" при сохранении
    })


@login_required
@require_http_methods(["DELETE"])
def ajax_delete_comment(request, comment_id):
    comment = get_object_or_404(Comment, pk=comment_id)

    if request.user != comment.author and not request.user.is_superuser:
        return HttpResponseForbidden("Нет доступа")

    comment.delete()
    return JsonResponse({'success': True})


@login_required
@require_POST
def ajax_submit_rating(request, article_id):
    article = get_object_or_404(Article, pk=article_id)
    value = request.POST.get('value')

    try:
        value = int(value)
        assert 1 <= value <= 5
    except (ValueError, AssertionError):
        return HttpResponseBadRequest("Неверное значение рейтинга")

    rating, created = Rating.objects.update_or_create(
        article=article,
        user=request.user,
        defaults={'value': value}
    )

    avg = Rating.objects.filter(article=article).aggregate(
        Avg('value'))['value__avg']
    count = Rating.objects.filter(article=article).count()
    ratings = Rating.objects.filter(article=article).select_related('user')

    return JsonResponse({
        'user_value': rating.value,
        'avg': round(avg or 0, 1),
        'count': count,
        'ratings': [
            {'id': r.id, 'user': r.user.name, 'value': r.value}
            for r in ratings
        ]
    })


@login_required
@require_http_methods(["DELETE"])
def ajax_delete_rating(request, rating_id):
    rating = get_object_or_404(Rating, pk=rating_id)
    article = rating.article

    if request.user != rating.user and not request.user.is_superuser:
        return HttpResponseForbidden("Нет доступа")

    rating.delete()

    avg = Rating.objects.filter(article=article).aggregate(
        Avg('value'))['value__avg']
    count = Rating.objects.filter(article=article).count()
    ratings = Rating.objects.filter(article=article).select_related('user')

    return JsonResponse({
        'success': True,
        'avg': round(avg or 0, 1),
        'count': count,
        'ratings': [
            {'id': r.id, 'user': r.user.name, 'value': r.value}
            for r in ratings
        ]
    })
