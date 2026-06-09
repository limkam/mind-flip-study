"""CORS origin regex and refresh-cookie SameSite policy."""

import re

import pytest

from config import Settings, _VERCEL_PREVIEW_ORIGIN_RE


def test_cors_origin_regex_none_by_default():
    s = Settings()
    assert s.cors_origin_regex is None


def test_cors_origin_regex_vercel_previews():
    s = Settings(CORS_ALLOW_VERCEL_PREVIEWS=True)
    assert s.cors_origin_regex == _VERCEL_PREVIEW_ORIGIN_RE
    origin = "https://mind-flip-study-bod50ry3e-lims-projects-f160119c.vercel.app"
    assert re.fullmatch(s.cors_origin_regex, origin)


def test_cors_origin_regex_custom_patterns():
    s = Settings(CORS_ORIGIN_REGEX=r"https://preview\.example\.com")
    assert s.cors_origin_regex == r"https://preview\.example\.com"


def test_cors_origin_regex_combines_vercel_and_custom():
    s = Settings(
        CORS_ALLOW_VERCEL_PREVIEWS=True,
        CORS_ORIGIN_REGEX=r"https://preview\.example\.com",
    )
    assert "|" in s.cors_origin_regex
    assert re.fullmatch(s.cors_origin_regex, "https://my-app.vercel.app")
    assert re.fullmatch(s.cors_origin_regex, "https://preview.example.com")


def test_refresh_cookie_samesite_defaults_strict():
    s = Settings()
    assert s.refresh_token_cookie_samesite == "strict"


def test_refresh_cookie_samesite_auto_none_for_vercel_previews():
    s = Settings(CORS_ALLOW_VERCEL_PREVIEWS=True)
    assert s.refresh_token_cookie_samesite == "none"


def test_refresh_cookie_samesite_explicit_override():
    s = Settings(CORS_ALLOW_VERCEL_PREVIEWS=True, REFRESH_TOKEN_COOKIE_SAMESITE="strict")
    assert s.refresh_token_cookie_samesite == "strict"


def test_refresh_cookie_samesite_rejects_invalid_value():
    with pytest.raises(ValueError, match="REFRESH_TOKEN_COOKIE_SAMESITE"):
        Settings(REFRESH_TOKEN_COOKIE_SAMESITE="bogus").refresh_token_cookie_samesite


def test_validate_refresh_cookie_policy_requires_secure_for_none():
    s = Settings(
        CORS_ALLOW_VERCEL_PREVIEWS=True,
        REFRESH_TOKEN_COOKIE_SECURE=False,
    )
    with pytest.raises(ValueError, match="REFRESH_TOKEN_COOKIE_SECURE=true"):
        s.validate_refresh_cookie_policy()


def test_validate_refresh_cookie_policy_ok_when_secure():
    s = Settings(
        CORS_ALLOW_VERCEL_PREVIEWS=True,
        REFRESH_TOKEN_COOKIE_SECURE=True,
    )
    s.validate_refresh_cookie_policy()
