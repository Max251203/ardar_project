from django.shortcuts import render
from apps.articles.models import Article
from django.utils import translation

def home(request):
    if request.user.is_authenticated:
        # Показываем все одобренные статьи + неодобренные статьи автора
        articles = (Article.objects.filter(is_approved=True) |
                    Article.objects.filter(author=request.user)).distinct().order_by('-created_at')[:6]
    else:
        # Для неавторизованных пользователей только одобренные статьи
        articles = Article.objects.filter(
            is_approved=True).order_by('-created_at')[:6]

    lang = translation.get_language()
    return render(request, "core/home.html", {
        "articles": articles,
        "is_ru": lang.startswith("ru"),
        "is_en": lang.startswith("en"),
        "is_hy": lang.startswith("hy"),
    })
    


def access_denied(request):
    return render(request, 'core/403.html')
