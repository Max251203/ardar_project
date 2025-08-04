from django.contrib import admin
from .models import Donation

@admin.register(Donation)
class DonationAdmin(admin.ModelAdmin):
    list_display = ('id', 'amount', 'email', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('email',)
    readonly_fields = ('created_at',)