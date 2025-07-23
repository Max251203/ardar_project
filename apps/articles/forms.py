from django import forms
from .models import Article


class ArticleForm(forms.ModelForm):
    # Добавляем поле для загрузки изображения, которое не будет напрямую сохраняться в модель
    image = forms.ImageField(required=False, widget=forms.ClearableFileInput(
        attrs={'class': 'input-field'}
    ))

    # Поле для загрузки файла с текстом
    uploaded_file = forms.FileField(required=False, widget=forms.FileInput(
        attrs={
            'class': 'input-field',
            'accept': '.txt,.docx,.doc'  # Ограничиваем типы файлов
        }
    ))

    class Meta:
        model = Article
        fields = ['title', 'language', 'text']
        widgets = {
            'title': forms.TextInput(attrs={'class': 'input-field', 'placeholder': 'Введите заголовок статьи'}),
            'language': forms.Select(attrs={'class': 'input-field'}),
            'text': forms.Textarea(attrs={'class': 'input-field', 'rows': 10}),
        }
