# backend/api/views_auth.py
from django.contrib.auth import authenticate, get_user_model
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.contrib.auth.password_validation import validate_password
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from dj_rest_auth.registration.views import SocialLoginView
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.models import SocialApp
from django.contrib.sites.models import Site
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers

from .models import UserProfile

User = get_user_model()

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"

# For local development use secure=False and samesite=Lax
COOKIE_SECURE = False
COOKIE_SAMESITE = "Lax"


def _get_profile(user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def _user_payload(user):
    profile = _get_profile(user)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "date_joined": user.date_joined,
        "onboarding_completed": profile.onboarding_completed,
        "is_staff": user.is_staff,
    }


def _auth_response(user, refresh_obj, status_code=status.HTTP_200_OK, is_new_user: bool | None = None):
    resp = Response(
        {
            "user": _user_payload(user),
            "access": str(refresh_obj.access_token),
            "refresh": str(refresh_obj),
            "is_new_user": bool(is_new_user) if is_new_user is not None else False,
        },
        status=status_code,
    )
    _set_auth_cookies(resp, refresh_obj)
    return resp

def _cookie_max_age(setting_key: str) -> int | None:
    lifetime = settings.SIMPLE_JWT.get(setting_key)
    if lifetime is None:
        return None
    return int(lifetime.total_seconds())


def _set_auth_cookies(resp, refresh_token_obj):
    """
    Set HttpOnly cookies on Response.
    Access token is short lived.
    Refresh token is long lived.
    """
    access_token = str(refresh_token_obj.access_token)
    refresh_token = str(refresh_token_obj)

    resp.set_cookie(
        ACCESS_COOKIE,
        access_token,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=_cookie_max_age("ACCESS_TOKEN_LIFETIME"),
        path="/",
    )
    resp.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=_cookie_max_age("REFRESH_TOKEN_LIFETIME"),
        path="/",
    )


def _clear_auth_cookies(resp):
    resp.delete_cookie(ACCESS_COOKIE, path="/")
    resp.delete_cookie(REFRESH_COOKIE, path="/")


@method_decorator(csrf_exempt, name="dispatch")
class GoogleLogin(SocialLoginView):
    adapter_class = GoogleOAuth2Adapter

    def post(self, request, *args, **kwargs):
        env_app_configured = bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)
        try:
            site = Site.objects.get_current()
            has_app = SocialApp.objects.filter(provider="google", sites=site).exists()
        except Exception:
            has_app = False

        if not has_app and not env_app_configured:
            return Response(
                {
                    "detail": (
                        "Google login not configured. Ensure the Google Social Application "
                        "is linked to the current Site (SITE_ID=1) in Django Admin, or set "
                        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            response = super().post(request, *args, **kwargs)
        except Exception as e:
            return Response(
                {
                    "detail": "Google login failed. Verify the access token and Google app configuration.",
                    "error": str(e)[:200],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = getattr(self, "user", None)
        if not user:
            return response

        # Normalize user fields for social signups
        email = (getattr(user, "email", "") or "").strip()
        if email:
            user.email = email
            if not user.username:
                user.username = email
            user.set_unusable_password()
            user.save(update_fields=["email", "username", "password"])

        profile = _get_profile(user)
        is_new_user = not profile.onboarding_completed
        data = {
            "user": _user_payload(user),
            "is_new_user": is_new_user,
        }
        if isinstance(response.data, dict):
            if response.data.get("access"):
                data["access"] = response.data.get("access")
            if response.data.get("refresh"):
                data["refresh"] = response.data.get("refresh")
        response.data = data
        return response
    

@extend_schema(
    request=inline_serializer(
        name="RegisterRequest",
        fields={
            "username": drf_serializers.CharField(),
            "email": drf_serializers.EmailField(),
            "password": drf_serializers.CharField(),
        },
    ),
    responses={201: None, 400: None},
)
@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    """
    POST body: { username, email, password }
    Response: 201 and cookies set on success
    """
    username = (request.data.get("username") or "").strip()
    email = (request.data.get("email") or "").strip()
    password = request.data.get("password") or ""

    if not username or not password or not email:
        return Response({"detail": "username, email, and password required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_email(email)
    except ValidationError:
        return Response({"detail": "invalid email"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(password)
    except ValidationError as e:
        return Response({"detail": "; ".join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username__iexact=username).exists():
        return Response({"detail": "username taken"}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(email__iexact=email).exists():
        return Response({"detail": "email already in use"}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, email=email, password=password)
    _get_profile(user)

    refresh = RefreshToken.for_user(user)
    return _auth_response(user, refresh, status_code=status.HTTP_201_CREATED, is_new_user=True)


@extend_schema(
    request=inline_serializer(
        name="LoginRequest",
        fields={
            "username_or_email": drf_serializers.CharField(),
            "password": drf_serializers.CharField(),
        },
    ),
    responses={200: None, 400: None, 401: None},
)
@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    """
    POST body: { username_or_email, password }
    Accepts username or email.
    Sets cookies on success.
    """
    identifier = (
        request.data.get("username_or_email")
        or request.data.get("identifier")
        or request.data.get("email")
        or request.data.get("username")
        or ""
    ).strip()
    password = request.data.get("password") or ""

    if not identifier or not password:
        return Response({"detail": "username_or_email and password required"}, status=status.HTTP_400_BAD_REQUEST)

    matched_user = (
        User.objects.filter(username__iexact=identifier).first()
        or User.objects.filter(email__iexact=identifier).first()
    )

    if matched_user and not matched_user.has_usable_password():
        return Response(
            {
                "detail": (
                    "This account uses Google sign-in. Continue with Google or set a password first."
                )
            },
            status=status.HTTP_401_UNAUTHORIZED,
        )

    auth_username = matched_user.username if matched_user else identifier
    user = authenticate(request, username=auth_username, password=password)

    if not user:
        return Response({"detail": "invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

    refresh = RefreshToken.for_user(user)
    is_new_user = not _get_profile(user).onboarding_completed
    return _auth_response(user, refresh, status_code=status.HTTP_200_OK, is_new_user=is_new_user)


@api_view(["POST"])
@permission_classes([AllowAny])
def refresh(request):
    """
    Read refresh token from cookie and set a new access cookie.
    """
    token = request.COOKIES.get(REFRESH_COOKIE)
    if not token:
        return Response({"detail": "no refresh token"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        refresh_obj = RefreshToken(token)
    except TokenError:
        return Response({"detail": "invalid refresh token"}, status=status.HTTP_401_UNAUTHORIZED)

    new_access = str(refresh_obj.access_token)
    resp = Response({"detail": "refreshed"}, status=status.HTTP_200_OK)
    resp.set_cookie(
        ACCESS_COOKIE,
        new_access,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=_cookie_max_age("ACCESS_TOKEN_LIFETIME"),
        path="/",
    )
    return resp


@api_view(["POST"])
@permission_classes([AllowAny])
def logout(request):
    """
    Clear auth cookies.
    """
    resp = Response({"detail": "logged out"}, status=status.HTTP_200_OK)
    _clear_auth_cookies(resp)
    return resp


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):
    """
    Return or update current user if authenticated.
    """
    u = request.user
    if request.method == "GET":
        return Response({"user": _user_payload(u)}, status=status.HTTP_200_OK)

    username = (request.data.get("username") or "").strip()
    email = (request.data.get("email") or "").strip()
    onboarding_completed = request.data.get("onboarding_completed", None)

    if username:
        if User.objects.filter(username__iexact=username).exclude(id=u.id).exists():
            return Response({"detail": "username taken"}, status=status.HTTP_400_BAD_REQUEST)

    if email and User.objects.filter(email__iexact=email).exclude(id=u.id).exists():
        return Response({"detail": "email already in use"}, status=status.HTTP_400_BAD_REQUEST)

    update_fields = []
    if username:
        u.username = username
        update_fields.append("username")
    if email:
        u.email = email
        update_fields.append("email")
    if update_fields:
        u.save(update_fields=update_fields)

    if onboarding_completed is not None:
        profile = _get_profile(u)
        profile.onboarding_completed = bool(onboarding_completed)
        profile.save(update_fields=["onboarding_completed"])

    return Response({"user": _user_payload(u)}, status=status.HTTP_200_OK)
