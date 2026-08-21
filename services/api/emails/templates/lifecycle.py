"""Versioned lifecycle templates. All user values and URLs are escaped."""

from html import escape
from urllib.parse import urlparse

from emails.templates.base import BASE_STYLES, wrap_email

TEMPLATE_VERSION = "v1"


def _url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("email link must be an absolute http(s) URL")
    return escape(value, quote=True)


def render_lifecycle(template_key: str, payload: dict) -> tuple[str, str, str]:
    name = escape(str(payload.get("first_name") or "there"))
    cta = _url(str(payload["cta_url"]))
    pref = _url(str(payload["preferences_url"]))
    unsubscribe = _url(str(payload["unsubscribe_url"])) if payload.get("unsubscribe_url") else None
    title = ""
    copy = ""
    subject = ""
    if template_key == "welcome":
        subject, title = "Welcome to Bilkeys", f"Welcome, {name}"
        copy = "Turn your learning material into focused study sessions and start when you’re ready."
    elif template_key == "continue_learning":
        entity = escape(str(payload.get("entity_name") or "your study session"))
        subject, title, copy = "Continue learning with Bilkeys", f"Ready to continue, {name}?", f"Your progress in {entity} is saved."
    elif template_key == "achievement_unlocked":
        achievement = escape(str(payload["achievement_name"]))
        subject, title, copy = f"Achievement unlocked: {achievement}", f"Nice work, {name}", f"You unlocked {achievement}."
    elif template_key == "weekly_progress_summary":
        metrics = payload.get("metrics") or {}
        if not any(int(metrics.get(k) or 0) for k in ("units_completed", "learning_minutes", "assessments_completed")):
            raise ValueError("empty_weekly_summary")
        subject, title = "Your Bilkeys week in review", f"Your weekly progress, {name}"
        copy = (f"Completed: {int(metrics.get('units_completed') or 0)} · "
                f"Learning time: {int(metrics.get('learning_minutes') or 0)} minutes · "
                f"Assessment average: {float(metrics.get('assessment_average') or 0):.1f}% · "
                f"Current streak: {int(metrics.get('current_streak') or 0)} days")
    else:
        raise ValueError("unknown lifecycle template")
    s = BASE_STYLES
    footer = f'<br><a href="{pref}">Manage preferences</a>'
    if unsubscribe:
        footer += f' · <a href="{unsubscribe}">Unsubscribe</a>'
    html = wrap_email(body_html=f'<main><h1 style="{s["h1"]}">{title}</h1><p style="{s["p"]}">{copy}</p><p><a style="{s["button"]}" href="{cta}">Continue in Bilkeys</a></p></main>', footer_extra=footer)
    text = f"{title}\n\n{copy}\n\nContinue in Bilkeys: {cta}\nManage preferences: {pref}"
    if unsubscribe:
        text += f"\nUnsubscribe: {unsubscribe}"
    return subject, html, text
