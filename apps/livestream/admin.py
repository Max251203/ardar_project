from django.contrib import admin
from .models import LivestreamRoom


@admin.register(LivestreamRoom)
class LivestreamRoomAdmin(admin.ModelAdmin):
    list_display = ('name', 'host', 'type', 'started_at', 'is_active')
    list_filter = ('type', 'is_active')
    search_fields = ('name', 'host__name', 'host__email')
    date_hierarchy = 'started_at'
