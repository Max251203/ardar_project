from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login
from .forms import LoginForm, RegisterForm
from django.contrib.auth import logout


def auth_view(request):
    mode = request.POST.get('mode', 'login')
    login_form = LoginForm(request, data=request.POST or None)
    register_form = RegisterForm(request.POST or None)

    if request.method == 'POST':
        if mode == 'login' and login_form.is_valid():
            user = login_form.get_user()
            login(request, user)
            return redirect('home')

        elif mode == 'register' and register_form.is_valid():
            user = register_form.save(commit=False)
            user.set_password(register_form.cleaned_data['password'])
            user.save()
            login(request, user)
            return redirect('home')

    return render(request, 'users/auth.html', {
        'login_form': login_form,
        'register_form': register_form,
        'mode': mode,
    })


def logout_user(request):
    logout(request)
    return redirect('home')
