from django.shortcuts import render


def swagger_ui(request):
    return render(
        request,
        "api/swagger_ui.html",
        {
            "schema_url": "/schema/",
            "page_title": "CineMatch API Docs",
        },
    )
