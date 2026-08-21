"""Email template for second credit purchase upsell to subscription."""

from __future__ import annotations

from config import settings
from emails.templates.base import BASE_STYLES, first_name, wrap_email


def second_purchase_upsell_email(full_name: str) -> str:
    """Upsell email sent when user makes their second credit purchase."""
    s = BASE_STYLES
    name = first_name(full_name)
    upgrade_url = f"{settings.FRONTEND_URL.rstrip('/')}/billing"
    
    body = f"""
      <h1 style="{s['h1']}">You're a Bilkeys power user, {name}! 🌟</h1>
      <p style="{s['p']}">
        We noticed you just purchased your second credit package. 
        That's awesome—you clearly love studying with Bilkeys!
      </p>
      <p style="{s['p']}">
        Here's a thought: for the price of just 3-4 credit packages, 
        you could get a <strong>Student subscription</strong> with:
      </p>
      <ul style="{s['p']}">
        <li>✨ Unlimited AI-generated flashcards every month</li>
        <li>🎮 Unlimited game plays</li>
        <li>📊 Advanced study analytics</li>
        <li>🏆 Priority support</li>
      </ul>
      <p style="margin:24px 0;">
        <a href="{upgrade_url}" style="{s['button']}">Explore Subscriptions</a>
      </p>
      <p style="{s['muted']}">
        No pressure—credits work great for occasional users. 
        But if you're studying regularly, a subscription saves money and stress.
      </p>
    """
    return wrap_email(body_html=body)
