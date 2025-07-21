from django.utils import translation

def language_flags(request):
    lang = translation.get_language()
    return {
        "is_ru": lang.startswith("ru"),
        "is_en": lang.startswith("en"),
        "is_hy": lang.startswith("hy"),
        "LANGUAGE_CODE": lang,
    }