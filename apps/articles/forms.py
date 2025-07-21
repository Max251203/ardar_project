from django import forms
from .models import Article


class ArticleForm(forms.ModelForm):
    class Meta:
        model = Article
        fields = ['title', 'language', 'image', 'text', 'uploaded_file']
        widgets = {
            'title': forms.TextInput(attrs={'class': 'input-field'}),
            'language': forms.Select(attrs={'class': 'input-field'}),
            'image': forms.ClearableFileInput(attrs={'class': 'input-field'}),
            'text': forms.Textarea(attrs={'class': 'input-field', 'rows': 10}),
            'uploaded_file': forms.FileInput(attrs={'class': 'input-field'}),
        }
