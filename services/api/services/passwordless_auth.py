"""Single-use email verification challenges backed by Redis."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets

from redis.asyncio import Redis

from config import settings

CODE_TTL_SECONDS = 10 * 60
RESEND_COOLDOWN_SECONDS = 60
MAX_VERIFY_ATTEMPTS = 5

_CLAIM_CHALLENGE_SCRIPT = """
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end

local payload = cjson.decode(raw)
if not payload.email or not payload.digest or not payload.attempts_left then
  redis.call('DEL', KEYS[1])
  return nil
end

if payload.claimed then return nil end

if payload.digest == ARGV[1] then
  payload.claimed = ARGV[2]
  redis.call('SET', KEYS[1], cjson.encode(payload), 'KEEPTTL')
  return payload.email
end

payload.attempts_left = tonumber(payload.attempts_left) - 1
if payload.attempts_left <= 0 then
  redis.call('DEL', KEYS[1])
else
  redis.call('SET', KEYS[1], cjson.encode(payload), 'KEEPTTL')
end
return nil
"""

_RELEASE_CLAIM_SCRIPT = """
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local payload = cjson.decode(raw)
if payload.claimed ~= ARGV[1] then return 0 end
payload.claimed = nil
redis.call('SET', KEYS[1], cjson.encode(payload), 'KEEPTTL')
return 1
"""

_FINALIZE_CLAIM_SCRIPT = """
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local payload = cjson.decode(raw)
if payload.claimed ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1
"""


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _email_fingerprint(email: str) -> str:
    return hashlib.sha256(normalize_email(email).encode("utf-8")).hexdigest()


def challenge_key(challenge_id: str) -> str:
    return f"auth:email:challenge:{challenge_id}"


def cooldown_key(email: str) -> str:
    return f"auth:email:cooldown:{_email_fingerprint(email)}"


def active_challenge_key(email: str) -> str:
    return f"auth:email:active:{_email_fingerprint(email)}"


def code_digest(challenge_id: str, email: str, code: str) -> str:
    message = f"{challenge_id}:{normalize_email(email)}:{code}".encode("utf-8")
    return hmac.new(settings.JWT_SECRET.encode("utf-8"), message, hashlib.sha256).hexdigest()


async def create_email_challenge(redis: Redis, email: str) -> tuple[str, str] | None:
    normalized = normalize_email(email)
    cooldown_started = await redis.set(
        cooldown_key(normalized),
        "1",
        ex=RESEND_COOLDOWN_SECONDS,
        nx=True,
    )
    if not cooldown_started:
        return None

    challenge_id = secrets.token_urlsafe(32)
    code = f"{secrets.randbelow(1_000_000):06d}"
    payload = {
        "email": normalized,
        "digest": code_digest(challenge_id, normalized, code),
        "attempts_left": MAX_VERIFY_ATTEMPTS,
    }
    active_key = active_challenge_key(normalized)
    previous_challenge_id = await redis.get(active_key)
    if isinstance(previous_challenge_id, bytes):
        previous_challenge_id = previous_challenge_id.decode("utf-8")
    if isinstance(previous_challenge_id, str):
        await redis.delete(challenge_key(previous_challenge_id))
    async with redis.pipeline(transaction=True) as pipe:
        pipe.setex(
            challenge_key(challenge_id),
            CODE_TTL_SECONDS,
            json.dumps(payload, separators=(",", ":")),
        )
        pipe.setex(active_key, CODE_TTL_SECONDS, challenge_id)
        await pipe.execute()
    return challenge_id, code


async def claim_email_challenge(
    redis: Redis,
    challenge_id: str,
    code: str,
) -> tuple[str, str] | None:
    # The Lua script makes compare, attempt decrement, and deletion one atomic
    # operation. This prevents two concurrent requests from consuming one code.
    # The digest is calculated for the normalized email stored in the payload;
    # fetch it without exposing it outside Redis first.
    raw = await redis.get(challenge_key(challenge_id))
    if not raw:
        return None
    try:
        payload = json.loads(raw)
        email = normalize_email(str(payload["email"]))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        await redis.delete(challenge_key(challenge_id))
        return None

    submitted = code_digest(challenge_id, email, code)
    claim_token = secrets.token_urlsafe(32)
    result = await redis.eval(
        _CLAIM_CHALLENGE_SCRIPT,
        1,
        challenge_key(challenge_id),
        submitted,
        claim_token,
    )
    if isinstance(result, bytes):
        result = result.decode("utf-8")
    return (normalize_email(result), claim_token) if isinstance(result, str) else None


async def release_email_challenge_claim(redis: Redis, challenge_id: str, claim_token: str) -> None:
    await redis.eval(_RELEASE_CLAIM_SCRIPT, 1, challenge_key(challenge_id), claim_token)


async def finalize_email_challenge(redis: Redis, challenge_id: str, claim_token: str) -> None:
    await redis.eval(_FINALIZE_CLAIM_SCRIPT, 1, challenge_key(challenge_id), claim_token)


async def consume_email_challenge(redis: Redis, challenge_id: str, code: str) -> str | None:
    """Compatibility helper for callers that require immediate consumption."""
    claim = await claim_email_challenge(redis, challenge_id, code)
    if claim is None:
        return None
    email, token = claim
    await finalize_email_challenge(redis, challenge_id, token)
    return email


async def revoke_email_challenge(redis: Redis, challenge_id: str, email: str) -> None:
    """Remove a challenge and its cooldown when delivery did not succeed."""
    await redis.delete(
        challenge_key(challenge_id),
        active_challenge_key(email),
        cooldown_key(email),
    )
