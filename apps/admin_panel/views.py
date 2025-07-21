from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth import get_user_model
from django.http import HttpResponseForbidden
from django.contrib import messages

from apps.articles.models import Article
from apps.articles.forms import ArticleForm

User = get_user_model()

# ==== DASHBOARD ==== #


@login_required
def admin_dashboard(request):
    if not is_admin(request):
        return HttpResponseForbidden("Нет доступа к админке")

    return render(request, 'admin_panel/dashboard.html', {
        'total_articles': Article.objects.count(),
        'pending_articles': Article.objects.filter(is_approved=False).count(),
        'approved_articles': Article.objects.filter(is_approved=True).count(),
        'total_users': User.objects.count(),
    })

# ==== СТАТЬИ ==== #


@login_required
def admin_articles(request):
    if not is_admin(request):
        return HttpResponseForbidden()

    status = request.GET.get('status', 'all')

    if status == 'pending':
        articles = Article.objects.filter(is_approved=False)
    elif status == 'approved':
        articles = Article.objects.filter(is_approved=True)
    else:
        articles = Article.objects.all()

    return render(request, 'admin_panel/articles.html', {
        'articles': articles.order_by('-created_at'),
        'status': status
    })


@login_required
def admin_create_article(request):
    if not is_admin(request):
        return HttpResponseForbidden()

    form = ArticleForm(request.POST or None, request.FILES or None)

    if form.is_valid():
        article = form.save(commit=False)
        article.author = request.user
        article.is_approved = True
        article.save()
        messages.success(request, "Статья создана")
        return redirect('admin_articles')

    return render(request, 'admin_panel/article_form.html', {'form': form})


@login_required
def admin_edit_article(request, pk):
    if not is_admin(request):
        return HttpResponseForbidden()

    article = get_object_or_404(Article, pk=pk)
    form = ArticleForm(request.POST or None,
                       request.FILES or None, instance=article)

    if form.is_valid():
        form.save()
        messages.success(request, "Изменения сохранены")
        return redirect('admin_articles')

    return render(request, 'admin_panel/article_form.html', {'form': form, 'edit_mode': True})


@login_required
def admin_delete_article(request, pk):
    if not is_admin(request):
        return HttpResponseForbidden()

    article = get_object_or_404(Article, pk=pk)
    article.delete()
    messages.success(request, "Статья удалена")
    return redirect('admin_articles')


@login_required
def admin_approve_article(request, pk):
    if not is_admin(request):
        return HttpResponseForbidden()

    article = get_object_or_404(Article, pk=pk)
    article.is_approved = True
    article.save()
    return redirect('admin_articles')


@login_required
def admin_reject_article(request, pk):
    if not is_admin(request):
        return HttpResponseForbidden()

    article = get_object_or_404(Article, pk=pk)
    article.delete()
    return redirect('admin_articles')


# ==== ПОЛЬЗОВАТЕЛИ ==== #

@login_required
def admin_users(request):
    if not is_admin(request):
        return HttpResponseForbidden()

    users = User.objects.all().order_by('-date_joined')
    return render(request, 'admin_panel/users.html', {'users': users})


@login_required
def admin_edit_user(request, user_id):
    if not is_admin(request):
        return HttpResponseForbidden()

    user = get_object_or_404(User, id=user_id)

    if user == request.user:
        return HttpResponseForbidden("Нельзя редактировать себя")

    if request.method == 'POST':
        user.name = request.POST.get('name')
        user.email = request.POST.get('email')
        user.save()
        messages.success(request, 'Пользователь обновлён')
        return redirect('admin_users')

    return render(request, 'admin_panel/user_form.html', {'user': user})


@login_required
def admin_change_role(request, user_id):
    if not is_admin(request):
        return HttpResponseForbidden()

    user = get_object_or_404(User, id=user_id)

    if request.method == 'POST':
        new_role = request.POST.get('role')
        if new_role in dict(User.ROLE_CHOICES):
            user.role = new_role
            user.save()
            messages.success(request, 'Роль обновлена')
            return redirect('admin_users')

    return render(request, 'admin_panel/change_role.html', {'user': user})


@login_required
def admin_delete_user(request, user_id):
    if not is_admin(request):
        return HttpResponseForbidden()

    user = get_object_or_404(User, id=user_id)
    if user == request.user:
        return HttpResponseForbidden("Нельзя удалить себя")

    user.delete()
    messages.success(request, 'Пользователь удалён')
    return redirect('admin_users')


# Утилиты
def is_admin(request):
    return request.user.is_authenticated and (
        request.user.is_superuser or getattr(request.user, 'role', '') == 'admin')
