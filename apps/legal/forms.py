from django import forms
from .models import LegalDocument


class LegalDocumentForm(forms.ModelForm):
    class Meta:
        model = LegalDocument
        fields = ['title', 'content']
        widgets = {
            'title': forms.TextInput(attrs={'class': 'input-field'}),
        }
