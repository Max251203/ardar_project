from django import forms


class APIKeyForm(forms.Form):
    armtts_api_key = forms.CharField(
        label="API ключ для ArmTTS",
        widget=forms.TextInput(
            attrs={'class': 'input-field', 'placeholder': 'Введите API ключ'})
    )


class AgoraAPIForm(forms.Form):
    agora_app_id = forms.CharField(
        label="Agora App ID",
        widget=forms.TextInput(
            attrs={'class': 'input-field', 'placeholder': 'Введите App ID'})
    )
    agora_app_certificate = forms.CharField(
        label="Agora App Certificate",
        widget=forms.TextInput(
            attrs={'class': 'input-field', 'placeholder': 'Введите App Certificate'})
    )
    agora_token_expire = forms.IntegerField(
        label="Время жизни токена (сек)",
        initial=3600,
        min_value=60,  # Минимальное значение - 60 секунд
        widget=forms.NumberInput(attrs={'class': 'input-field', 'min': '60'})
    )

    def clean_agora_token_expire(self):
        value = self.cleaned_data['agora_token_expire']
        if value < 60:
            raise forms.ValidationError(
                "Время жизни токена должно быть не менее 60 секунд")
        return value
