from django.shortcuts import redirect
from django.contrib.auth import authenticate, login, logout
from .forms import LoginForm, RegisterForm


def auth_view(request):
    """
    Обрабатывает POST-запросы для входа и регистрации.
    Больше не рендерит шаблон, так как авторизация происходит через модальное окно.
    """
    if request.method == 'POST':
        mode = request.POST.get('mode', 'login')

        if mode == 'login':
            login_form = LoginForm(request, data=request.POST)
            if login_form.is_valid():
                user = login_form.get_user()
                login(request, user)
                return redirect('home')

        elif mode == 'register':
            register_form = RegisterForm(request.POST)
            if register_form.is_valid():
                user = register_form.save(commit=False)
                user.set_password(register_form.cleaned_data['password'])
                user.save()
                login(request, user)
                return redirect('home')

    # Если запрос не POST или форма невалидна, перенаправляем на главную
    return redirect('home')


def logout_user(request):
    logout(request)
    return redirect('home')
