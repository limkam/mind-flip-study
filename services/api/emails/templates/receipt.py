"""Email templates for payment receipts, payment failures, and cancellations."""

from __future__ import annotations

from datetime import datetime

from emails.templates.base import BASE_STYLES, first_name, wrap_email


def _format_amount(amount_cents: int, currency: str) -> str:
    amount = amount_cents / 100
    symbol = "$" if currency.lower() == "usd" else f"{currency.upper()} "
    return f"{symbol}{amount:,.2f}"


def _format_date(dt: datetime) -> str:
    return f"{dt.strftime('%B')} {dt.day}, {dt.year}"


def _invoice_link_line(s: dict, invoice_url: str | None) -> str:
    if not invoice_url:
        return ""
    return f'<p style="{s["p"]}">Your invoice is available <a href="{invoice_url}">here</a>.</p>'


def _receipt_link_line(s: dict, receipt_url: str | None) -> str:
    if not receipt_url:
        return ""
    return f'<p style="{s["p"]}">Your payment receipt is available <a href="{receipt_url}">here</a>.</p>'


def subscription_receipt_email(
    full_name: str,
    plan_name: str,
    amount_cents: int,
    currency: str,
    next_billing_date: datetime | None,
    invoice_url: str | None = None,
    receipt_url: str | None = None,
) -> str:
    s = BASE_STYLES
    name = first_name(full_name)
    amount = _format_amount(amount_cents, currency)
    next_line = (
        f'<p style="{s["p"]}">Your next billing date is <strong>{_format_date(next_billing_date)}</strong>.</p>'
        if next_billing_date
        else ""
    )
    body = f"""
      <h1 style="{s['h1']}">You're all set, {name}.</h1>
      <p style="{s['p']}">
        Your <strong>{plan_name}</strong> plan is now active. We charged <strong>{amount}</strong> to your payment method on file.
      </p>
      {next_line}
      {_receipt_link_line(s, receipt_url)}
      {_invoice_link_line(s, invoice_url)}
      <p style="{s['muted']}">
        Questions about this charge? Reply to this email or visit Billing &amp; Usage in your account.
      </p>
    """
    return wrap_email(body_html=body)


def renewal_receipt_email(
    full_name: str,
    plan_name: str,
    amount_cents: int,
    currency: str,
    next_billing_date: datetime | None,
    invoice_url: str | None = None,
    receipt_url: str | None = None,
) -> str:
    s = BASE_STYLES
    name = first_name(full_name)
    amount = _format_amount(amount_cents, currency)
    next_line = (
        f'<p style="{s["p"]}">Your next billing date is <strong>{_format_date(next_billing_date)}</strong>.</p>'
        if next_billing_date
        else ""
    )
    body = f"""
      <h1 style="{s['h1']}">Your subscription renewed, {name}.</h1>
      <p style="{s['p']}">
        We charged <strong>{amount}</strong> to your payment method on file for your <strong>{plan_name}</strong> plan.
      </p>
      {next_line}
      {_receipt_link_line(s, receipt_url)}
      {_invoice_link_line(s, invoice_url)}
      <p style="{s['muted']}">
        Questions about this charge? Reply to this email or visit Billing &amp; Usage in your account.
      </p>
    """
    return wrap_email(body_html=body)


def upgrade_receipt_email(
    full_name: str,
    plan_name: str,
    amount_cents: int,
    currency: str,
    next_billing_date: datetime | None,
    invoice_url: str | None = None,
    receipt_url: str | None = None,
) -> str:
    s = BASE_STYLES
    name = first_name(full_name)
    amount = _format_amount(amount_cents, currency)
    next_line = (
        f'<p style="{s["p"]}">Your next billing date is <strong>{_format_date(next_billing_date)}</strong>.</p>'
        if next_billing_date
        else ""
    )
    body = f"""
      <h1 style="{s['h1']}">You're upgraded, {name}.</h1>
      <p style="{s['p']}">
        We charged <strong>{amount}</strong> to your payment method on file — the prorated cost of switching to <strong>{plan_name}</strong> today.
      </p>
      {next_line}
      {_receipt_link_line(s, receipt_url)}
      {_invoice_link_line(s, invoice_url)}
      <p style="{s['muted']}">
        Questions about this charge? Reply to this email or visit Billing &amp; Usage in your account.
      </p>
    """
    return wrap_email(body_html=body)


def credit_purchase_receipt_email(
    full_name: str,
    quantity: int,
    amount_cents: int,
    currency: str,
    invoice_url: str | None = None,
    receipt_url: str | None = None,
) -> str:
    s = BASE_STYLES
    name = first_name(full_name)
    amount = _format_amount(amount_cents, currency)
    plural = "" if quantity == 1 else "s"
    body = f"""
      <h1 style="{s['h1']}">Credits added, {name}.</h1>
      <p style="{s['p']}">
        You purchased <strong>{quantity} credit{plural}</strong> for <strong>{amount}</strong>. They're available in your account now.
      </p>
      {_receipt_link_line(s, receipt_url)}
      {_invoice_link_line(s, invoice_url)}
      <p style="{s['muted']}">
        Questions about this charge? Reply to this email or visit Billing &amp; Usage in your account.
      </p>
    """
    return wrap_email(body_html=body)


def payment_failed_email(
    full_name: str,
    amount_cents: int,
    currency: str,
    access_end_date: datetime | None,
) -> str:
    s = BASE_STYLES
    name = first_name(full_name)
    amount = _format_amount(amount_cents, currency)
    retry_line = (
        f"If it's still unresolved by <strong>{_format_date(access_end_date)}</strong>, your access may be affected then."
        if access_end_date
        else "We'll keep retrying automatically over the next few days."
    )
    body = f"""
      <h1 style="{s['h1']}">A payment didn't go through, {name}.</h1>
      <p style="{s['p']}">
        We tried to charge <strong>{amount}</strong> for your MindFlip subscription and it didn't go through.
        Stripe will retry automatically — no action is needed right now.
      </p>
      <p style="{s['p']}">{retry_line}</p>
      <p style="{s['muted']}">
        If your card has expired or changed, you can update it anytime from Billing &amp; Usage in your account.
      </p>
    """
    return wrap_email(body_html=body)


def cancellation_confirmation_email(
    full_name: str,
    access_end_date: datetime,
    invoice_url: str | None = None,
    receipt_url: str | None = None,
) -> str:
    s = BASE_STYLES
    name = first_name(full_name)
    body = f"""
      <h1 style="{s['h1']}">Your subscription is canceled, {name}.</h1>
      <p style="{s['p']}">
        This confirms your cancellation went through. You'll keep full access until <strong>{_format_date(access_end_date)}</strong>,
        after which your account moves to the free plan.
      </p>
      {_receipt_link_line(s, receipt_url)}
      {_invoice_link_line(s, invoice_url)}
      <p style="{s['muted']}">
        Changed your mind? You can resubscribe anytime from Billing &amp; Usage.
      </p>
    """
    return wrap_email(body_html=body)
