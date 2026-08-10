"""Email templates for trial lifecycle."""

from __future__ import annotations

from config import settings
from emails.templates.base import BASE_STYLES, first_name, wrap_email


def trial_ending_soon_email(full_name: str, days_left: int = 2) -> str:
    s = BASE_STYLES
    name = first_name(full_name)
    billing_url = f"{settings.FRONTEND_URL.rstrip('/')}/profile"

    body = f"""
      <h1 style=\"{s['h1']}\">Your Premium trial ends soon, {name}</h1>
      <p style=\"{s['p']}\">
        Your MindFlip Premium trial ends in <strong>{days_left} days</strong>.
      </p>
      <p style=\"{s['p']}\">
        If you do nothing, your plan will convert automatically and you’ll keep uninterrupted access.
      </p>
      <p style=\"{s['p']}\">
        Prefer not to continue? You can cancel in one tap from your account page.
      </p>
      <p style=\"margin:24px 0;\">
        <a href=\"{billing_url}\" style=\"{s['button']}\">Manage subscription</a>
      </p>
      <p style=\"{s['muted']}\">
        Existing books and flashcards always remain available in your account.
      </p>
    """
    return wrap_email(body_html=body)
