from django import template
register = template.Library()


@register.filter
def average(queryset, field):
    values = [getattr(obj, field, 0)
              for obj in queryset if getattr(obj, field, None) is not None]
    return sum(values) / len(values) if values else None
