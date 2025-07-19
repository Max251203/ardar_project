from django import forms
from django.contrib.auth.forms import AuthenticationForm
from apps.users.models import CustomUser


class LoginForm(AuthenticationForm):
    username = forms.EmailField(label="Email", widget=forms.EmailInput(attrs={
        'placeholder': 'Email',
        'class': 'input-field'
    }))
    password = forms.CharField(label="Пароль", widget=forms.PasswordInput(attrs={
        'placeholder': 'Пароль',
        'class': 'input-field'
    }))


class RegisterForm(forms.ModelForm):
    password = forms.CharField(
        label="Пароль", widget=forms.PasswordInput(attrs={'class': 'input-field'}))
    password_confirm = forms.CharField(
        label="Повторите пароль", widget=forms.PasswordInput(attrs={'class': 'input-field'}))

    class Meta:
        model = CustomUser
        fields = ['name', 'email']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'input-field'}),
            'email': forms.EmailInput(attrs={'class': 'input-field'}),
        }

    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get("password")
        confirm = cleaned_data.get("password_confirm")

        if password and confirm and password != confirm:
            raise forms.ValidationError("Пароли не совпадают")
