# apps/comments/forms.py
from django import forms
from .models import Comment, Rating


class CommentForm(forms.ModelForm):
    class Meta:
        model = Comment
        fields = ['text']
        widgets = {
            'text': forms.Textarea(attrs={
                'class': 'input-field',
                'rows': 4,
                'placeholder': 'Напишите ваш комментарий...'
            }),
        }


class RatingForm(forms.ModelForm):
    class Meta:
        model = Rating
        fields = ['value']
        widgets = {
            'value': forms.RadioSelect(attrs={'class': 'rating-input'})
        }
