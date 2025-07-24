from django.shortcuts import redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from .forms import LoginForm, RegisterForm
from django.shortcuts import render, redirect
from django.contrib.auth import get_user_model
from django.conf import settings
User = get_user_model()


User = get_user_model()


def auth_view(request):
    """
    Обрабатывает POST-запросы для входа и регистрации.
    """
    if request.method == 'POST':
        mode = request.POST.get('mode', 'login')

        if mode == 'login':
            login_form = LoginForm(request, data=request.POST)
            if login_form.is_valid():
                user = login_form.get_user()
                login(request, user)
                return redirect('home')
            else:
                # Покажи ошибку в модальном окне или на странице
                messages.error(request, "Неверный email или пароль.")
                return redirect('home')

        elif mode == 'register':
            register_form = RegisterForm(request.POST)
            if register_form.is_valid():
                user = register_form.save(commit=False)
                user.set_password(register_form.cleaned_data['password'])
                user.save()
                # Укажи backend явно!
                user.backend = 'django.contrib.auth.backends.ModelBackend'
                login(request, user)
                return redirect('home')
            else:
                # Покажи ошибку в модальном окне или на странице
                messages.error(
                    request, "Ошибка регистрации. Проверьте введённые данные.")
                return redirect('home')

    # Если запрос не POST или форма невалидна, перенаправляем на главную
    return redirect('home')


def logout_user(request):
    logout(request)
    return redirect('home')


@login_required
def user_profile(request):
    """
    Отображение и редактирование профиля пользователя
    """
    # Получаем социальные аккаунты пользователя, если установлен django-allauth
    social_accounts = []
    if 'allauth.socialaccount' in settings.INSTALLED_APPS:
        from allauth.socialaccount.models import SocialAccount
        social_accounts = SocialAccount.objects.filter(user=request.user)

    if request.method == 'POST':
        # Обработка формы редактирования профиля
        name = request.POST.get('name')
        email = request.POST.get('email')

        if name and email:
            # Проверяем, не занят ли email другим пользователем
            if email != request.user.email and User.objects.filter(email=email).exists():
                messages.error(
                    request, "Этот email уже используется другим пользователем")
                return render(request, 'users/profile.html', {'social_accounts': social_accounts})

            # Обновляем данные пользователя
            request.user.name = name
            request.user.email = email
            request.user.save()

            messages.success(request, "Профиль успешно обновлен")
            return redirect('user_profile')

    return render(request, 'users/profile.html', {'social_accounts': social_accounts})
