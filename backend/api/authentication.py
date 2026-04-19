# backend/api/authentication.py
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework.exceptions import AuthenticationFailed
from drf_spectacular.extensions import OpenApiAuthenticationExtension


class CookieJWTAuthentication(JWTAuthentication):
    """
    Read JWT access token from HttpOnly cookie named "access_token".

    Behavior:
    - If cookie missing, return None so request remains anonymous.
    - If token invalid or expired, return None so endpoints that handle refresh
      can still run.
    - If token valid, return (user, validated_token) as required by DRF.
    """

    def authenticate(self, request):
        raw_token = request.COOKIES.get("access_token")
        if not raw_token:
            auth_header = request.headers.get("Authorization") or request.META.get("HTTP_AUTHORIZATION")
            if isinstance(auth_header, str) and auth_header.startswith("Bearer "):
                raw_token = auth_header.split(" ", 1)[1].strip()
            else:
                return None

        # support "Bearer <token>" style if present
        if isinstance(raw_token, str) and raw_token.startswith("Bearer "):
            raw_token = raw_token.split(" ", 1)[1]

        try:
            validated_token = self.get_validated_token(raw_token)
            user = self.get_user(validated_token)
        except (InvalidToken, TokenError, AuthenticationFailed):
            # treat expired/malformed token or missing user as anonymous
            return None

        if user is None:
            return None

        # final tuple expected by DRF
        return (user, validated_token)


class CookieJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "api.authentication.CookieJWTAuthentication"
    name = "BearerAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": (
                "Paste a JWT access token. Obtain one via POST /api/auth/login/ "
                "or POST /api/auth/token/. Frontend users are authed via HttpOnly "
                "cookies automatically — Bearer is only needed for Swagger/curl."
            ),
        }
