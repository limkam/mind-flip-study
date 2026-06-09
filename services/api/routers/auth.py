from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from jose import JWTError
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from dependencies import enforce_auth_rate_limit, get_current_user, get_redis
from jwt_tokens import (
    TOKEN_TYPE_PASSWORD_RESET,
    TOKEN_TYPE_REFRESH,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    password_reset_redis_key,
    refresh_blocklist_key,
    ttl_seconds_remaining,
    PASSWORD_RESET_EXPIRE_SECONDS,
)
from models.enums import UserRole
from models.user import User
from passwords import hash_password, verify_password
from schemas.auth import (
    AppleLoginRequest,
    ForgotPasswordBody,
    GoogleLoginRequest,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    OnboardingRequest,
    RefreshTokenResponse,
    RegisterRequest,
    ResetPasswordBody,
)
from schemas.user import UserPublic
from age_utils import validate_date_of_birth
from countries import continent_for_country
from services.oauth_auth import verify_apple_identity_token, verify_google_id_token

router = APIRouter(tags=["auth"])

_REFRESH_COOKIE_NAME = "refresh_token"


def _refresh_cookie_kwargs() -> dict:
    return {
        "max_age": settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        "httponly": True,
        "secure": settings.REFRESH_TOKEN_COOKIE_SECURE,
        "samesite": settings.refresh_token_cookie_samesite,
        "path": settings.REFRESH_TOKEN_COOKIE_PATH,
    }


def _set_refresh_cookie(response: Response, value: str) -> None:
    response.set_cookie(_REFRESH_COOKIE_NAME, value, **_refresh_cookie_kwargs())


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=_REFRESH_COOKIE_NAME,
        path=settings.REFRESH_TOKEN_COOKIE_PATH,
        httponly=True,
        secure=settings.REFRESH_TOKEN_COOKIE_SECURE,
        samesite=settings.refresh_token_cookie_samesite,
    )


def _issue_login_response(*, user: User, response: Response) -> LoginResponse:
    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended",
        )
    access = create_access_token(subject=user.id)
    refresh = create_refresh_token(subject=user.id)
    _set_refresh_cookie(response, refresh)
    return LoginResponse(access_token=access, user=UserPublic.model_validate(user))


async def _get_or_create_google_user(db: AsyncSession, email: str, full_name: str) -> User:
    email = email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()
    if existing is not None:
        if full_name and existing.full_name.strip() != full_name.strip():
            existing.full_name = full_name.strip()[:255]
            await db.commit()
            await db.refresh(existing)
        return existing
    display = (full_name.strip()[:255] if full_name.strip() else email.split("@")[0])
    user = User(
        email=email,
        hashed_password=None,
        role=UserRole.student,
        full_name=display,
        preferences={},
        subscription_tier="free",
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        result = await db.execute(select(User).where(User.email == email))
        found = result.scalar_one_or_none()
        if found is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not create user",
            ) from None
        return found
    await db.refresh(user)
    return user


async def _get_or_create_apple_user(
    db: AsyncSession,
    claims: dict,
    full_name_override: str | None,
) -> User:
    sub = str(claims.get("sub") or "").strip()
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Apple token: missing sub",
        )
    r = await db.execute(select(User).where(User.oauth_apple_sub == sub))
    by_sub = r.scalar_one_or_none()
    if by_sub is not None:
        if full_name_override and full_name_override.strip():
            by_sub.full_name = full_name_override.strip()[:255]
            await db.commit()
            await db.refresh(by_sub)
        return by_sub
    email_raw = claims.get("email")
    email = str(email_raw).strip().lower() if email_raw else None
    name_hint = (
        (full_name_override.strip()[:255] if full_name_override and full_name_override.strip() else "")
        or (email.split("@")[0] if email else "Apple user")
    )
    if email:
        r2 = await db.execute(select(User).where(User.email == email))
        u_mail = r2.scalar_one_or_none()
        if u_mail is not None:
            if u_mail.oauth_apple_sub is None:
                u_mail.oauth_apple_sub = sub
            if full_name_override and full_name_override.strip():
                u_mail.full_name = full_name_override.strip()[:255]
            await db.commit()
            await db.refresh(u_mail)
            return u_mail
        user = User(
            email=email,
            hashed_password=None,
            role=UserRole.student,
            full_name=name_hint or "Apple user",
            preferences={},
            oauth_apple_sub=sub,
            subscription_tier="free",
        )
        db.add(user)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            r3 = await db.execute(select(User).where(User.oauth_apple_sub == sub))
            again = r3.scalar_one_or_none()
            if again is not None:
                return again
            r4 = await db.execute(select(User).where(User.email == email))
            by_email = r4.scalar_one_or_none()
            if by_email is not None:
                if by_email.oauth_apple_sub is None:
                    by_email.oauth_apple_sub = sub
                if full_name_override and full_name_override.strip():
                    by_email.full_name = full_name_override.strip()[:255]
                await db.commit()
                await db.refresh(by_email)
                return by_email
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not create or link Apple user",
            ) from None
        await db.refresh(user)
        return user
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Apple did not include an email for new sign-in. Use Hide My Email or sign in with Google first.",
    )


@router.post(
    "/google",
    response_model=LoginResponse,
    dependencies=[Depends(enforce_auth_rate_limit())],
)
async def google_login(
    body: GoogleLoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    response: Response,
) -> LoginResponse:
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured",
        )
    try:
        idinfo = verify_google_id_token(body.id_token, settings.GOOGLE_CLIENT_ID)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Google token") from None
    email = idinfo.get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google token did not include email")
    if idinfo.get("email_verified") is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google email not verified")
    full_name = str(idinfo.get("name") or "").strip()
    email_norm = str(email).strip().lower()
    user = await _get_or_create_google_user(db, email_norm, full_name)
    return _issue_login_response(user=user, response=response)


@router.post(
    "/apple",
    response_model=LoginResponse,
    dependencies=[Depends(enforce_auth_rate_limit())],
)
async def apple_login(
    body: AppleLoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    response: Response,
) -> LoginResponse:
    if not settings.APPLE_BUNDLE_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Apple Sign In is not configured",
        )
    try:
        claims = verify_apple_identity_token(
            body.identity_token,
            settings.APPLE_BUNDLE_ID,
            raw_nonce=body.nonce,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Apple token") from exc
    user = await _get_or_create_apple_user(db, claims, body.full_name)
    return _issue_login_response(user=user, response=response)


@router.post(
    "/register",
    response_model=UserPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_auth_rate_limit())],
)
async def register(body: RegisterRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> UserPublic:
    user = User(
        email=str(body.email),
        hashed_password=hash_password(body.password),
        role=UserRole.student,
        full_name=body.full_name,
        preferences={},
        subscription_tier="free",
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        ) from None
    await db.refresh(user)

    try:
        from tasks.email_tasks import send_welcome_email_task

        send_welcome_email_task.delay(user.full_name, str(user.email))
    except Exception:
        pass

    return UserPublic.model_validate(user)


@router.post("/onboarding", response_model=UserPublic)
async def complete_onboarding(
    body: OnboardingRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserPublic:
    country = body.country.strip()
    custom_country = body.custom_country.strip() if body.custom_country else None
    if country.lower() == "other":
        if not custom_country:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="custom_country is required when country is Other",
            )
    else:
        custom_country = None

    continent = (
        body.continent.strip()
        if body.continent
        else continent_for_country(country, custom_country=custom_country)
    )

    try:
        current_user.date_of_birth = validate_date_of_birth(body.date_of_birth)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    current_user.country = country
    current_user.custom_country = custom_country
    current_user.continent = continent
    current_user.occupation = body.occupation.strip()
    current_user.onboarding_completed = True
    await db.commit()
    await db.refresh(current_user)
    return UserPublic.model_validate(current_user)


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    dependencies=[Depends(enforce_auth_rate_limit())],
)
async def forgot_password(
    body: ForgotPasswordBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> MessageResponse:
    result = await db.execute(select(User).where(User.email == str(body.email)))
    user = result.scalar_one_or_none()
    if user is not None and user.hashed_password is not None and not user.is_banned:
        token = create_password_reset_token(subject=user.id)
        try:
            payload = decode_token(token)
            if payload.get("type") == TOKEN_TYPE_PASSWORD_RESET:
                jti = str(payload.get("jti", ""))
                if jti:
                    await redis.setex(
                        password_reset_redis_key(jti),
                        PASSWORD_RESET_EXPIRE_SECONDS,
                        str(user.id),
                    )
                    from tasks.email_tasks import send_password_reset_task

                    send_password_reset_task.delay(user.full_name, str(user.email), token)
        except Exception:
            pass
    return MessageResponse(message="If that email exists, a reset link is on its way.")


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    dependencies=[Depends(enforce_auth_rate_limit())],
)
async def reset_password(
    body: ResetPasswordBody,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> MessageResponse:
    try:
        payload = decode_token(body.token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        ) from None

    if payload.get("type") != TOKEN_TYPE_PASSWORD_RESET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )

    jti = str(payload.get("jti") or "")
    if not jti:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )

    stored = await redis.get(password_reset_redis_key(jti))
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )

    try:
        user_id = UUID(str(stored))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        ) from None

    if str(payload.get("sub")) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )

    user = await db.get(User, user_id)
    if user is None or user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )

    user.hashed_password = hash_password(body.password)
    await db.commit()
    await redis.delete(password_reset_redis_key(jti))
    return MessageResponse(message="Password updated. You can sign in now.")


@router.post(
    "/login",
    response_model=LoginResponse,
    dependencies=[Depends(enforce_auth_rate_limit())],
)
async def login(
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    response: Response,
) -> LoginResponse:
    result = await db.execute(select(User).where(User.email == str(body.email)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if user.hashed_password is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account uses Google or Apple sign-in.",
        )
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return _issue_login_response(user=user, response=response)


@router.post("/refresh", response_model=RefreshTokenResponse)
async def refresh_tokens(
    response: Response,
    redis: Annotated[Redis, Depends(get_redis)],
    refresh_token: Annotated[str | None, Cookie(alias=_REFRESH_COOKIE_NAME)] = None,
) -> RefreshTokenResponse:
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
        )

    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != TOKEN_TYPE_REFRESH:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        raw_jti = payload.get("jti")
        if raw_jti is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        old_jti = str(raw_jti)

        blocked = await redis.exists(refresh_blocklist_key(old_jti))
        if blocked:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")

        sub = UUID(str(payload["sub"]))
        remaining = ttl_seconds_remaining(payload["exp"])

        await redis.setex(refresh_blocklist_key(old_jti), remaining, "1")

        access = create_access_token(subject=sub)
        new_refresh = create_refresh_token(subject=sub)
        _set_refresh_cookie(response, new_refresh)
        return RefreshTokenResponse(access_token=access)
    except HTTPException:
        _clear_refresh_cookie(response)
        raise
    except (JWTError, KeyError, TypeError, ValueError):
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        ) from None


@router.post("/logout", response_model=MessageResponse)
async def logout(
    response: Response,
    redis: Annotated[Redis, Depends(get_redis)],
    refresh_token: Annotated[str | None, Cookie(alias=_REFRESH_COOKIE_NAME)] = None,
) -> MessageResponse:
    try:
        if refresh_token:
            try:
                payload = decode_token(refresh_token)
            except JWTError:
                payload = None
            if isinstance(payload, dict) and payload.get("type") == TOKEN_TYPE_REFRESH:
                raw_jti = payload.get("jti")
                exp = payload.get("exp")
                if raw_jti is not None and exp is not None:
                    ttl = ttl_seconds_remaining(exp)
                    await redis.setex(refresh_blocklist_key(str(raw_jti)), ttl, "1")
    finally:
        _clear_refresh_cookie(response)

    return MessageResponse(message="logged out")
