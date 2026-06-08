"""Shared inline styles and layout wrapper for email clients."""

from __future__ import annotations

BASE_STYLES = {
    "container": (
        "max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"
        "'Segoe UI',sans-serif;"
    ),
    "header": "background:#6366f1;padding:32px;text-align:center;",
    "logo": "color:#ffffff;font-size:28px;font-weight:700;text-decoration:none;",
    "body": "padding:32px;background:#ffffff;",
    "h1": "font-size:24px;font-weight:700;color:#0f172a;margin:0 0 12px;",
    "p": "font-size:16px;color:#475569;line-height:1.6;margin:0 0 16px;",
    "button": (
        "display:inline-block;background:#6366f1;color:#ffffff;padding:14px 28px;"
        "border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;"
    ),
    "footer": "padding:24px;text-align:center;font-size:13px;color:#94a3b8;",
    "muted": "font-size:13px;color:#94a3b8;",
}


def first_name(full_name: str) -> str:
    parts = full_name.strip().split()
    return parts[0] if parts else "there"


def wrap_email(*, body_html: str, footer_extra: str = "") -> str:
    s = BASE_STYLES
    footer = f"© 2025 MindFlip · Unsubscribe{footer_extra}"
    return f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="{s['container']}">
    <div style="{s['header']}">
      <span style="{s['logo']}">MindFlip</span>
    </div>
    <div style="{s['body']}">
      {body_html}
    </div>
    <div style="{s['footer']}">{footer}</div>
  </div>
</body>
</html>"""
