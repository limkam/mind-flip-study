"""Fetch Stripe invoice PDFs for email attachments, with a link fallback."""

from __future__ import annotations

import logging

import httpx
import stripe

from config import settings

log = logging.getLogger(__name__)


def fetch_invoice_pdf(invoice_id: str) -> tuple[bytes | None, str | None]:
    """Return (pdf_bytes, hosted_invoice_url) for a Stripe invoice.

    pdf_bytes is None if Stripe hasn't finished generating the PDF yet (it can
    lag slightly right after an event fires) or the download failed; callers
    should fall back to linking hosted_invoice_url instead of attaching.
    """
    if not settings.STRIPE_SECRET_KEY:
        return None, None
    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        invoice = stripe.Invoice.retrieve(invoice_id)
    except Exception:
        log.exception("stripe_invoice_retrieve_failed invoice_id=%s", invoice_id)
        return None, None

    # This SDK version's Invoice objects are plain attribute-access objects,
    # not dict-like (no .get()) — unlike the webhook payloads elsewhere in
    # this codebase, which are normalized to dicts before use.
    pdf_url = getattr(invoice, "invoice_pdf", None)
    hosted_url = getattr(invoice, "hosted_invoice_url", None)
    if not pdf_url:
        log.warning("stripe_invoice_pdf_not_ready invoice_id=%s", invoice_id)
        return None, hosted_url

    try:
        response = httpx.get(pdf_url, timeout=10.0, follow_redirects=True)
        response.raise_for_status()
        return response.content, hosted_url
    except Exception:
        log.exception("stripe_invoice_pdf_download_failed invoice_id=%s", invoice_id)
        return None, hosted_url
