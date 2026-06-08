#!/usr/bin/env python3
"""Ping Celery workers. Exit 0 if reachable, 1 otherwise."""

from __future__ import annotations

import sys
from pathlib import Path

_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from celery_health import inspect_celery_workers


def main() -> int:
    result = inspect_celery_workers()
    status = result["status"]
    workers = result.get("workers") or []
    if status == "ok":
        print(f"Celery is running ({len(workers)} worker(s)): {', '.join(workers) or 'unknown'}")
        return 0
    print("Celery worker is unavailable — start it with:")
    print("  celery -A tasks.celery_app worker --loglevel=info")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
