from __future__ import annotations

from html import escape

from emails.templates.base import BASE_STYLES, wrap_email


def sign_in_code_email(code: str) -> str:
    s = BASE_STYLES
    safe_code = escape(code)
    body = f"""
      <h1 style="{s['h1']}">Your MindFlip verification code</h1>
      <p style="{s['p']}">Use this one-time code to securely continue to your account.</p>
      <div style="font-size:36px;font-weight:800;letter-spacing:9px;color:#4f46e5;margin:24px 0;padding:20px;text-align:center;background:#eef2ff;border-radius:12px;">
        {safe_code}
      </div>
      <p style="{s['p']}">This code expires in <strong>10 minutes</strong> and can only be used once.</p>
      <p style="{s['muted']}"><strong>Never share this code.</strong> MindFlip will never ask you for it. If you did not request this code, you can safely ignore this email.</p>
    """
    return wrap_email(body_html=body)
