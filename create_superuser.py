import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ardar.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

# Проверяем, существует ли уже суперпользователь
if not User.objects.filter(email='superadmin@gmail.com').exists():
    User.objects.create_superuser(
        email='superadmin@gmail.com',
        password='superadmin123',
        name='Superadmin'
    )
    print('Superuser created successfully!')
else:
    print('Superuser already exists.')