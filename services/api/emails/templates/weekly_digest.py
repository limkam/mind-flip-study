from __future__ import annotations

from config import settings
from emails.templates.base import BASE_STYLES, first_name, wrap_email


def weekly_digest_email(full_name: str, stats: dict) -> str:
    s = BASE_STYLES
    name = first_name(full_name)
    analytics_url = f"{settings.FRONTEND_URL.rstrip('/')}/analytics"
    cards = stats.get("cards_reviewed", 0)
    avg_score = stats.get("avg_score", 0)
    streak = stats.get("streak_days", 0)
    rank = stats.get("rank")
    rank_display = f"#{rank}" if rank else "—"
    sets_done = stats.get("sets_completed", 0)
    encouragement = (
        "Strong week. Keep pushing."
        if avg_score >= 80
        else "Tough week. The games adapt to where you're struggling."
    )
    body = f"""
      <h1 style="{s['h1']}">Here's your week, {name}.</h1>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr>
          <td style="padding:12px;border:1px solid #e2e8f0;font-size:15px;color:#475569;">
            Cards reviewed<br><strong style="color:#0f172a;font-size:20px;">{cards}</strong>
          </td>
          <td style="padding:12px;border:1px solid #e2e8f0;font-size:15px;color:#475569;">
            Average score<br><strong style="color:#0f172a;font-size:20px;">{avg_score}%</strong>
          </td>
        </tr>
        <tr>
          <td style="padding:12px;border:1px solid #e2e8f0;font-size:15px;color:#475569;">
            Study streak<br><strong style="color:#0f172a;font-size:20px;">{streak} days</strong>
          </td>
          <td style="padding:12px;border:1px solid #e2e8f0;font-size:15px;color:#475569;">
            Leaderboard<br><strong style="color:#0f172a;font-size:20px;">{rank_display}</strong>
          </td>
        </tr>
      </table>
      <p style="{s['p']}">Sets completed this week: {sets_done}. {encouragement}</p>
      <p style="margin:24px 0;">
        <a href="{analytics_url}" style="{s['button']}">Study This Week's Weak Topics</a>
      </p>
      <p style="{s['muted']}">
        Weekly digest every Monday. Update in profile settings.
      </p>
    """
    return wrap_email(body_html=body)
