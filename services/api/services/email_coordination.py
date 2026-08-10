"""Stable PostgreSQL advisory-lock key shared by completion and email delivery."""
import hashlib
import uuid


def coordination_lock_key(user_id: uuid.UUID, entity_type: str, entity_id: str) -> int:
    digest = hashlib.sha256(f"{user_id}:{entity_type}:{entity_id}".encode()).digest()[:8]
    return int.from_bytes(digest, "big", signed=True)
