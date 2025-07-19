from django.shortcuts import render
from apps.articles.models import Article


def home(request):
    articles = Article.objects.filter(
        is_approved=True).order_by("-created_at")[:6]
    return render(request, "core/home.html", {"articles": articles})


def access_denied(request):
    return render(request, 'core/403.html')
