from __future__ import annotations

import asyncio
import json

import pytest

from services.passwordless_auth import (
    MAX_VERIFY_ATTEMPTS,
    consume_email_challenge,
    create_email_challenge,
    claim_email_challenge,
    finalize_email_challenge,
    release_email_challenge_claim,
)


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    async def set(self, key, value, *, ex=None, nx=False):
        if nx and key in self.values:
            return None
        self.values[key] = value
        if ex is not None:
            self.ttls[key] = int(ex)
        return True

    async def setex(self, key, ttl, value):
        self.values[key] = value
        self.ttls[key] = int(ttl)
        return True

    class _Pipeline:
        def __init__(self, redis):
            self.redis = redis
            self.operations = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def setex(self, key, ttl, value):
            self.operations.append((key, ttl, value))
            return self

        async def execute(self):
            for key, ttl, value in self.operations:
                await self.redis.setex(key, ttl, value)
            return [True] * len(self.operations)

    def pipeline(self, *, transaction=True):
        assert transaction is True
        return self._Pipeline(self)

    async def ttl(self, key):
        return self.ttls.get(key, -2)

    async def getdel(self, key):
        self.ttls.pop(key, None)
        return self.values.pop(key, None)

    async def get(self, key):
        return self.values.get(key)

    async def delete(self, *keys):
        removed = 0
        for key in keys:
            removed += key in self.values
            self.values.pop(key, None)
            self.ttls.pop(key, None)
        return removed

    async def eval(self, script, _numkeys, key, *args):
        raw = self.values.get(key)
        if raw is None:
            return None
        payload = json.loads(raw)
        if "payload.claimed = nil" in script:
            if payload.get("claimed") != args[0]:
                return 0
            payload.pop("claimed", None)
            self.values[key] = json.dumps(payload)
            return 1
        if "redis.call('DEL', KEYS[1])" in script and "payload.digest" not in script:
            if payload.get("claimed") != args[0]:
                return 0
            await self.delete(key)
            return 1
        submitted_digest, claim_token = args
        if payload.get("claimed"):
            return None
        if payload["digest"] == submitted_digest:
            payload["claimed"] = claim_token
            self.values[key] = json.dumps(payload)
            return payload["email"]
        payload["attempts_left"] -= 1
        if payload["attempts_left"] <= 0:
            await self.delete(key)
        else:
            self.values[key] = json.dumps(payload)
        return None


@pytest.mark.asyncio
async def test_email_challenge_is_single_use_and_normalizes_email():
    redis = FakeRedis()
    challenge_id, code = await create_email_challenge(redis, "  Student@Example.com ")

    assert await consume_email_challenge(redis, challenge_id, code) == "student@example.com"
    assert await consume_email_challenge(redis, challenge_id, code) is None


@pytest.mark.asyncio
async def test_wrong_code_can_be_retried_but_is_attempt_limited():
    redis = FakeRedis()
    challenge_id, code = await create_email_challenge(redis, "student@example.com")

    for _ in range(MAX_VERIFY_ATTEMPTS):
        assert await consume_email_challenge(redis, challenge_id, "000000" if code != "000000" else "111111") is None

    assert await consume_email_challenge(redis, challenge_id, code) is None


@pytest.mark.asyncio
async def test_resend_cooldown_blocks_immediate_second_challenge():
    redis = FakeRedis()

    assert await create_email_challenge(redis, "student@example.com") is not None
    assert await create_email_challenge(redis, "STUDENT@example.com") is None


@pytest.mark.asyncio
async def test_new_code_invalidates_previous_code_after_cooldown():
    redis = FakeRedis()
    first_id, first_code = await create_email_challenge(redis, "student@example.com")
    redis.values = {
        key: value for key, value in redis.values.items() if ":cooldown:" not in key
    }
    second_id, second_code = await create_email_challenge(redis, "student@example.com")

    assert await consume_email_challenge(redis, first_id, first_code) is None
    assert await consume_email_challenge(redis, second_id, second_code) == "student@example.com"


@pytest.mark.asyncio
async def test_concurrent_verification_only_succeeds_once():
    redis = FakeRedis()
    challenge_id, code = await create_email_challenge(redis, "student@example.com")

    results = await asyncio.gather(
        consume_email_challenge(redis, challenge_id, code),
        consume_email_challenge(redis, challenge_id, code),
    )

    assert results.count("student@example.com") == 1
    assert results.count(None) == 1


@pytest.mark.asyncio
async def test_transient_failure_releases_claim_for_safe_retry():
    redis = FakeRedis()
    challenge_id, code = await create_email_challenge(redis, "student@example.com")
    first = await claim_email_challenge(redis, challenge_id, code)
    assert first is not None
    assert await claim_email_challenge(redis, challenge_id, code) is None

    await release_email_challenge_claim(redis, challenge_id, first[1])
    retry = await claim_email_challenge(redis, challenge_id, code)
    assert retry is not None
    await finalize_email_challenge(redis, challenge_id, retry[1])
    assert await claim_email_challenge(redis, challenge_id, code) is None
