# apps/core/forms.py
from django import forms
from .models import SiteSettings


class APIKeyForm(forms.Form):
    armtts_api_key = forms.CharField(
        label="API ключ для ArmTTS",
        widget=forms.TextInput(
            attrs={'class': 'input-field', 'placeholder': 'Введите API ключ'})
    )
