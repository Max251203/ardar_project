from django import forms
from .models import Article


class ArticleForm(forms.ModelForm):
    class Meta:
        model = Article
        fields = ['title', 'language', 'image', 'text']
        widgets = {
            'title': forms.TextInput(attrs={'class': 'input-field', 'placeholder': 'Введите заголовок статьи'}),
            'language': forms.Select(attrs={'class': 'input-field'}),
            'image': forms.ClearableFileInput(attrs={'class': 'input-field'}),
            'text': forms.Textarea(attrs={'class': 'input-field', 'rows': 10, 'placeholder': 'Текст статьи...'}),
        }
        help_texts = {
            'image': 'Рекомендуемый размер изображения: 1200x630 пикселей',
            'language': 'Выберите язык статьи',
        }
