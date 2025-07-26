from django import forms
from .models import LivestreamRoom


class LivestreamRoomForm(forms.ModelForm):
    class Meta:
        model = LivestreamRoom
        fields = ['name', 'platform', 'type', 'description']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'input-field', 'placeholder': 'Название трансляции'}),
            'platform': forms.Select(attrs={'class': 'input-field'}),
            'type': forms.Select(attrs={'class': 'input-field'}),
            'description': forms.Textarea(attrs={'class': 'input-field', 'rows': 3, 'placeholder': 'Описание (необязательно)'}),
        }
