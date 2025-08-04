from django import forms
from .models import LivestreamRoom


class LivestreamRoomForm(forms.ModelForm):
    class Meta:
        model = LivestreamRoom
        fields = ['name', 'description']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'input-field', 'placeholder': 'Название трансляции'}),
            'description': forms.Textarea(attrs={'class': 'input-field', 'rows': 3, 'placeholder': 'Описание (необязательно)'}),
        }