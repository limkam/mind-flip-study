from __future__ import annotations

from config import settings
from emails.templates.base import BASE_STYLES, first_name, wrap_email


def welcome_email(full_name: str, email: str) -> str:
    _ = email  # reserved for future personalization
    s = BASE_STYLES
    name = first_name(full_name)
    library_url = f"{settings.FRONTEND_URL.rstrip('/')}/library"
    body = f"""
      <h1 style="{s['h1']}">You're in, {name}.</h1>
      <p style="{s['p']}">
        MindFlip turns your PDFs into flashcard games in 30 seconds.
        Here's how to get started:
      </p>
      <ol style="{s['p']}">
        <li>Upload a PDF (textbook, notes, anything)</li>
        <li>Watch the AI generate your flashcard set</li>
        <li>Pick a game and start studying</li>
      </ol>
      <p style="margin:24px 0;">
        <a href="{library_url}" style="{s['button']}">Upload Your First PDF</a>
      </p>
      <p style="{s['muted']}">
        You're on the Free plan. Upgrade to Student ($8/mo) for unlimited uploads.
      </p>
    """
    return wrap_email(body_html=body)
