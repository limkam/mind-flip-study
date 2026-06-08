"""Celery worker reachability checks."""

from __future__ import annotations


def inspect_celery_workers(*, timeout: float = 1.0) -> dict:
    """
    Ping Celery workers via the broker.

    Returns ``{"status": "ok"|"unavailable", "workers": [hostname, ...]}``.
    """
    from tasks.celery_app import celery

    try:
        inspector = celery.control.inspect(timeout=timeout)
        ping = inspector.ping() if inspector else None
    except Exception:
        ping = None

    if not ping:
        return {"status": "unavailable", "workers": []}

    return {"status": "ok", "workers": sorted(ping.keys())}
