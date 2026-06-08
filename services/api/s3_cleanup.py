"""Collect and delete S3 object keys attached to books (PDF + extras)."""

from __future__ import annotations

from typing import Any

from s3_service import delete_object_key


def collect_book_s3_keys(*, s3_key: str, extras: dict[str, Any] | None) -> list[str]:
    """Return unique S3 keys for a book record (primary PDF + nested extras)."""
    keys: list[str] = []
    seen: set[str] = set()

    def add(key: str | None) -> None:
        if not key or not isinstance(key, str):
            return
        k = key.strip()
        if k and k not in seen:
            seen.add(k)
            keys.append(k)

    add(s3_key)
    _walk_extras(extras or {}, add)
    return keys


def _walk_extras(obj: Any, add) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("s3_key", "s3Key", "object_key") and isinstance(v, str):
                add(v)
            else:
                _walk_extras(v, add)
    elif isinstance(obj, list):
        for item in obj:
            _walk_extras(item, add)


def delete_book_s3_assets(*, s3_key: str, extras: dict[str, Any] | None) -> None:
    for key in collect_book_s3_keys(s3_key=s3_key, extras=extras):
        delete_object_key(key)
