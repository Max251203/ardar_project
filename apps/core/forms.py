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
        min_value=60,
        widget=forms.NumberInput(attrs={'class': 'input-field', 'min': '60'})
    )

    def clean_agora_token_expire(self):
        value = self.cleaned_data['agora_token_expire']
        if value < 60:
            raise forms.ValidationError("Время жизни токена должно быть не менее 60 секунд")
        return value


class FreeKassaForm(forms.Form):
    merchant_id = forms.CharField(
        label="FreeKassa Merchant ID",
        widget=forms.TextInput(
            attrs={'class': 'input-field', 'placeholder': 'например, 123456'})
    )
    secret1 = forms.CharField(
        label="Secret word #1",
        widget=forms.TextInput(
            attrs={'class': 'input-field', 'placeholder': 'секретное слово #1'})
    )
    secret2 = forms.CharField(
        label="Secret word #2",
        widget=forms.TextInput(
            attrs={'class': 'input-field', 'placeholder': 'секретное слово #2'})
    )
    currency = forms.ChoiceField(
        label="Валюта приема",
        choices=[('RUB', 'RUB')],
        initial='RUB',
        widget=forms.Select(attrs={'class': 'input-field'})
    )
    receiver_info = forms.CharField(
        label="Реквизиты получателя (для справки)",
        required=False,
        widget=forms.Textarea(attrs={
            'class': 'input-field',
            'placeholder': 'Например: Номер карты для вывода в кабинете, ИНН/Юр.лицо и пр. (не используется шлюзом)'
        })
    )