from __future__ import annotations

from config import settings
from emails.templates.base import BASE_STYLES, wrap_email


def password_reset_email(full_name: str, reset_token: str) -> str:
    s = BASE_STYLES
    reset_url = (
        f"{settings.FRONTEND_URL.rstrip('/')}/auth/reset-password?token={reset_token}"
    )
    body = f"""
      <h1 style="{s['h1']}">Reset your password</h1>
      <p style="{s['p']}">
        We received a request to reset the password for your MindFlip account.
        Click the button below — this link expires in 1 hour.
      </p>
      <p style="margin:24px 0;">
        <a href="{reset_url}" style="{s['button']}">Reset Password</a>
      </p>
      <p style="{s['muted']}">
        If you didn't request this, ignore this email. Your password won't change.
      </p>
    """
    return wrap_email(body_html=body)
