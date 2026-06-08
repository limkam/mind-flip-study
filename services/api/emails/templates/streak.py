from __future__ import annotations

from config import settings
from emails.templates.base import BASE_STYLES, wrap_email


def streak_reminder_email(full_name: str, streak_days: int) -> str:
    s = BASE_STYLES
    study_url = f"{settings.FRONTEND_URL.rstrip('/')}/study"
    if streak_days > 0:
        heading = "Your streak is waiting."
        detail = (
            f"You've studied {streak_days} days in a row. "
            "Log in for 5 minutes to keep it going."
        )
    else:
        heading = "Start a new streak today."
        detail = "It's been a while. Pick up where you left off."
    body = f"""
      <h1 style="{s['h1']}">{heading}</h1>
      <p style="{s['p']}">{detail}</p>
      <p style="margin:24px 0;">
        <a href="{study_url}" style="{s['button']}">Study Now</a>
      </p>
      <p style="{s['muted']}">
        You're receiving this because you enabled streak reminders.
        Update preferences in your profile.
      </p>
    """
    return wrap_email(body_html=body)
