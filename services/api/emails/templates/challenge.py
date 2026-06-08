from __future__ import annotations

from config import settings
from emails.templates.base import BASE_STYLES, first_name, wrap_email


def challenge_alert_email(
    recipient_name: str,
    challenger_name: str,
    set_title: str,
    challenger_score: int,
    challenge_id: str,
) -> str:
    s = BASE_STYLES
    name = first_name(recipient_name)
    challenge_url = f"{settings.FRONTEND_URL.rstrip('/')}/challenges/{challenge_id}"
    score_line = (
        f"They scored {challenger_score}% on &quot;{set_title}&quot;."
        if challenger_score > 0
        else f"They challenged you on &quot;{set_title}&quot;."
    )
    body = f"""
      <h1 style="{s['h1']}">{challenger_name} wants a rematch.</h1>
      <p style="{s['p']}">Hi {name}, {score_line} Think you can beat it?</p>
      <p style="margin:24px 0;">
        <a href="{challenge_url}" style="{s['button']}">Accept the Challenge</a>
      </p>
      <p style="{s['muted']}">Challenge expires in 48 hours.</p>
    """
    return wrap_email(body_html=body)
