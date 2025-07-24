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

        # Обработка загруженного изображения
        if 'image' in request.FILES:
            image_file = request.FILES['image']
            # Читаем данные изображения
            article.image_data = image_file.read()
            article.image_name = image_file.name
            article.image_type = image_file.content_type

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

    if form.is_valid() and request.method == 'POST':
        article = form.save(commit=False)

        # Обработка загруженного изображения
        if 'image' in request.FILES:
            image_file = request.FILES['image']
            # Читаем данные изображения
            article.image_data = image_file.read()
            article.image_name = image_file.name
            article.image_type = image_file.content_type

        article.save()
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
        return HttpResponseForbidden("Нет прав")

    user = get_object_or_404(User, id=user_id)

    # Проверяем, что обычный админ не может редактировать суперадмина или другого админа
    if not request.user.is_superuser and user.is_superuser:
        return HttpResponseForbidden("У вас нет прав для редактирования суперадминистратора")

    # Проверяем, что обычный админ не может редактировать других админов (кроме себя)
    if not request.user.is_superuser and user.role == 'admin' and user != request.user:
        return HttpResponseForbidden("У вас нет прав для редактирования других администраторов")

    # Если пользователь редактирует себя, запрещаем менять роль
    is_self_edit = user == request.user

    if request.method == 'POST':
        name = request.POST.get('name')
        email = request.POST.get('email')
        role = request.POST.get('role')

        # Проверяем, что пользователь не меняет свою роль
        if is_self_edit and role != user.role:
            return HttpResponseForbidden("Вы не можете изменить свою роль")

        # Проверяем, что обычный админ не может назначить роль админа
        if not request.user.is_superuser and role == 'admin' and user != request.user:
            return HttpResponseForbidden("Только суперадминистратор может назначать роль администратора")

        if name and email and (is_self_edit or role in dict(User.ROLE_CHOICES)):
            user.name = name
            user.email = email
            if not is_self_edit:
                user.role = role
            user.save()
            messages.success(
                request, f"Пользователь {user.email} успешно обновлен")
            return redirect('admin_users')

    return render(request, 'admin_panel/user_form.html', {'user': user, 'is_self_edit': is_self_edit})


@login_required
def admin_change_role(request, user_id):
    if not is_admin(request):
        return HttpResponseForbidden("Нет прав")

    user = get_object_or_404(User, id=user_id)

    # Проверяем, что обычный админ не может менять роль суперадмина или другого админа
    if (user.is_superuser or user.role == 'admin') and not request.user.is_superuser:
        return HttpResponseForbidden("У вас нет прав для изменения роли администратора или суперадминистратора")

    # Проверяем, что пользователь не меняет свою роль
    if user == request.user:
        return HttpResponseForbidden("Вы не можете изменить свою роль")

    if request.method == 'POST':
        new_role = request.POST.get('role')

        # Проверяем, что обычный админ не может назначить роль админа
        if not request.user.is_superuser and new_role == 'admin':
            return HttpResponseForbidden("Только суперадминистратор может назначать роль администратора")

        if new_role in dict(User.ROLE_CHOICES):
            user.role = new_role
            user.save()
            messages.success(
                request, f"Роль пользователя {user.email} изменена на {user.get_role_display()}")
            return redirect('admin_users')

    return render(request, 'admin_panel/change_role.html', {'user': user})


@login_required
def admin_delete_user(request, user_id):
    if not is_admin(request):
        return HttpResponseForbidden("Нет прав")

    user = get_object_or_404(User, id=user_id)

    # Проверяем, что обычный админ не может удалить суперадмина или другого админа
    if (user.is_superuser or user.role == 'admin') and not request.user.is_superuser:
        return HttpResponseForbidden("У вас нет прав для удаления администратора или суперадминистратора")

    # Проверяем, что пользователь не удаляет себя
    if user == request.user:
        return HttpResponseForbidden("Нельзя удалить себя")

    user.delete()
    messages.success(request, 'Пользователь удалён')
    return redirect('admin_users')


@login_required
def admin_create_user(request):
    if not is_admin(request):
        return HttpResponseForbidden("Нет прав")

    if request.method == 'POST':
        email = request.POST.get('email')
        name = request.POST.get('name')
        password = request.POST.get('password')
        role = request.POST.get('role')

        # Проверяем, что обычный админ не может создать админа
        if not request.user.is_superuser and role == 'admin':
            return HttpResponseForbidden("Только суперадминистратор может создавать администраторов")

        if email and name and password and role in dict(User.ROLE_CHOICES):
            # Проверяем, что пользователь с таким email не существует
            if User.objects.filter(email=email).exists():
                messages.error(
                    request, f"Пользователь с email {email} уже существует")
                return render(request, 'admin_panel/user_create.html')

            # Создаем пользователя
            user = User.objects.create_user(
                email=email,
                password=password,
                name=name,
                role=role
            )
            messages.success(request, f"Пользователь {email} успешно создан")
            return redirect('admin_users')

    return render(request, 'admin_panel/user_create.html')

# Утилиты


def is_admin(request):
    return request.user.is_authenticated and (
        request.user.is_superuser or getattr(request.user, 'role', '') == 'admin')
