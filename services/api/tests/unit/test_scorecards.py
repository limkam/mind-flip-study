from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from services.scorecards import (
    FORMULA_VERSION,
    calculate_score,
    comparison,
    component_scores,
    data_state,
    is_personal_best,
    period_bounds,
    previous_bounds,
    refresh_current_scorecards,
)
from routers.scorecards import generate_scorecard, list_scorecards, refresh_scorecards
from services.scorecard_sharing import PublicScorecardView, generate_token, render_html, render_svg, security_headers, token_hash, valid_token_shape


def test_score_is_bounded() -> None:
    assert calculate_score(assessments=999, average_score=150, learning_minutes=9999, active_days=99) == 100


def test_missing_accuracy_is_partial_not_fabricated() -> None:
    assert calculate_score(assessments=0, average_score=None, learning_minutes=0, active_days=0) == 0


def test_excessive_screen_time_cannot_dominate() -> None:
    assert calculate_score(assessments=0, average_score=None, learning_minutes=10_000, active_days=0) == 10


def test_negative_inputs_are_clamped() -> None:
    assert calculate_score(assessments=-3, average_score=-20, learning_minutes=-9, active_days=-2) == 0


def test_share_tokens_have_256_bits_of_random_input_and_are_unique() -> None:
    tokens = {generate_token() for _ in range(1000)}
    assert len(tokens) == 1000
    assert min(map(len, tokens)) >= 43


def test_public_schema_cannot_expose_identity_or_share_token() -> None:
    fields = set(PublicScorecardView.__dataclass_fields__)
    assert not fields.intersection({"user_id", "email", "public_share_token", "token_hash"})


def test_share_token_hash_and_shape() -> None:
    token = generate_token()
    assert valid_token_shape(token)
    assert token_hash(token) != token
    assert len(token_hash(token)) == 64
    assert not valid_token_shape("bad/token")


def test_public_rendering_has_metadata_headers_and_no_private_sentinels() -> None:
    view = PublicScorecardView("Weekly", 82, "v1", "2026-07-01", "2026-07-07", "partial", 2, 75.0, 20, 3, 45, 2, (("Accuracy", 75),), False, "up", None, "Keep going <script>", None)
    page = render_html(view, "https://app.example/share/scorecard/opaque", "https://app.example/share/scorecard/opaque/image", "https://app.example")
    for marker in ('property="og:title"', 'property="og:description"', 'property="og:image"', 'property="og:url"', 'name="twitter:card"', 'rel="canonical"', "Formula version: v1"):
        assert marker in page
    assert "Keep going &lt;script&gt;" in page and "<script>" not in page
    for private in ("private-user@example.com", "internal-user-uuid-secret", "/private/server/path", "PRIVATE_QUIZ_ANSWER"):
        assert private not in page
    assert security_headers()["Cache-Control"] == "private, no-store, max-age=0"
    svg = render_svg(view)
    assert 'width="1200"' in svg and 'height="630"' in svg and "<script" not in svg


def test_weekly_monthly_and_course_period_support() -> None:
    today = date(2026, 7, 29)
    assert period_bounds("weekly", today) == (date(2026, 7, 27), today)
    assert period_bounds("monthly", today) == (date(2026, 7, 1), today)
    assert previous_bounds("monthly", date(2026, 7, 1)) == (date(2026, 6, 1), date(2026, 6, 30))
    # Course periods are data-driven and persisted with an entity id.
    from models.engagement import Scorecard
    assert "entity_id" in Scorecard.__table__.columns


def test_empty_and_partial_data_states() -> None:
    assert data_state({"cards_reviewed": 0, "assessments_completed": 0}) == "empty"
    assert data_state({"cards_reviewed": 4, "assessments_completed": 0}) == "partial"
    assert data_state({"cards_reviewed": 4, "assessments_completed": 1, "average_assessment_score": 80}) == "complete"


def test_only_lessons_only_quizzes_and_mixed_activity() -> None:
    assert data_state({"cards_reviewed": 10, "assessments_completed": 0}) == "partial"
    assert data_state({"cards_reviewed": 0, "assessments_completed": 2, "average_assessment_score": 75}) == "complete"
    assert data_state({"cards_reviewed": 10, "assessments_completed": 2, "average_assessment_score": 75}) == "complete"
    lesson_only = calculate_score(assessments=0, average_score=None, learning_minutes=0, active_days=3)
    quiz_only = calculate_score(assessments=3, average_score=100, learning_minutes=30, active_days=0)
    assert 0 < lesson_only < 100 and 0 < quiz_only < 100


def test_previous_comparison_and_most_improved_skill() -> None:
    current = {"score": 70, "component_scores": {"accuracy": 80, "consistency": 70, "activity": 60, "healthy_time": 50}}
    previous = {"score": 50, "data_state": "complete", "component_scores": {"accuracy": 70, "consistency": 40, "activity": 50, "healthy_time": 50}}
    result = comparison(current, previous)
    assert result["score_delta"] == 20
    assert result["direction"] == "up"
    assert result["most_improved_skill"] == "consistency"
    assert comparison(current, None) is None


def test_declined_unchanged_and_tied_improvement_are_deterministic() -> None:
    base = {"data_state": "complete", "component_scores": {"accuracy": 50, "consistency": 50, "activity": 50, "healthy_time": 50}}
    declined = comparison({"score": 40, "component_scores": {"accuracy": 40, "consistency": 40, "activity": 40, "healthy_time": 40}}, {**base, "score": 50})
    assert declined["direction"] == "down" and declined["most_improved_skill"] is None
    unchanged = comparison({"score": 50, "component_scores": base["component_scores"]}, {**base, "score": 50})
    assert unchanged["direction"] == "flat" and unchanged["most_improved_skill"] is None
    tied = comparison({"score": 60, "component_scores": {"accuracy": 60, "consistency": 60, "activity": 50, "healthy_time": 50}}, {**base, "score": 50})
    assert tied["most_improved_skill"] == "accuracy"


def test_personal_best_requires_strict_improvement_after_first_score() -> None:
    assert is_personal_best(50, None)
    assert not is_personal_best(50, 50)
    assert is_personal_best(51, 50)
    assert not is_personal_best(49, 50)


def test_component_extremes_remain_bounded_and_explainable() -> None:
    values = component_scores(assessments=10_000, average_score=999, learning_minutes=100_000, active_days=999, available_days=31)
    assert set(values) == {"accuracy", "consistency", "activity", "healthy_time"}
    assert all(0 <= value <= 100 for value in values.values())
    assert FORMULA_VERSION == "v2"


def test_month_boundary_and_multiple_week_month_scaling() -> None:
    assert previous_bounds("monthly", date(2026, 3, 1)) == (date(2026, 2, 1), date(2026, 2, 28))
    month = component_scores(assessments=20, average_score=100, learning_minutes=600, active_days=20, available_days=31)
    assert all(0 <= value <= 100 for value in month.values())


@pytest.mark.asyncio
async def test_list_returns_persisted_cache_without_waiting_for_refresh(monkeypatch) -> None:
    monkeypatch.setattr("routers.scorecards._require_scorecards", lambda: None)
    result_proxy = SimpleNamespace(all=lambda: [])
    db = SimpleNamespace(scalars=AsyncMock(return_value=result_proxy))
    user = SimpleNamespace(id="00000000-0000-0000-0000-000000000001")
    assert await list_scorecards(user, db) == []


@pytest.mark.asyncio
async def test_refresh_endpoint_recomputes_then_returns_latest(monkeypatch) -> None:
    refresh = AsyncMock(return_value=[])
    monkeypatch.setattr("routers.scorecards._require_scorecards", lambda: None)
    monkeypatch.setattr("routers.scorecards.refresh_current_scorecards", refresh)
    result_proxy = SimpleNamespace(all=lambda: [])
    db = SimpleNamespace(scalars=AsyncMock(return_value=result_proxy))
    user = SimpleNamespace(id="00000000-0000-0000-0000-000000000001")
    assert await refresh_scorecards(user, db) == []
    refresh.assert_awaited_once_with(db, user.id)


@pytest.mark.asyncio
async def test_old_generate_endpoint_remains_compatible(monkeypatch) -> None:
    from uuid import uuid4
    today = date(2026, 7, 29)
    row = SimpleNamespace(id=uuid4(), period_type="weekly", entity_id="", period_start=today, period_end=today, score=50, formula_version="v2", metrics={})
    monkeypatch.setattr("routers.scorecards._require_scorecards", lambda: None)
    monkeypatch.setattr("routers.scorecards.refresh_current_scorecards", AsyncMock(return_value=[row]))
    result = await generate_scorecard(SimpleNamespace(id=uuid4()), SimpleNamespace())
    assert result.score == 50 and result.period_type == "weekly"


def test_refresh_hooks_and_manual_ui_regression_are_present() -> None:
    from pathlib import Path
    root = Path(__file__).resolve().parents[4]
    study = (root / "services/api/routers/study.py").read_text()
    quiz = (root / "services/api/routers/quiz_results.py").read_text()
    page = (root / "src/pages/Scorecards.jsx").read_text()
    assert "await refresh_current_scorecards(db, current_user.id, affected_set_id=card.set_id)" in study
    assert "await refresh_current_scorecards(db, current_user.id, affected_set_id=body.set_id)" in quiz
    assert 'invalidateQueries({ queryKey: ["scorecards"] })' in (root / "src/pages/StudySession.jsx").read_text()
    assert not any(term in page for term in ("Generate Scorecard", "Generate this week", "generateScorecard", 'post("/scorecards/generate'))


@pytest.mark.asyncio
async def test_automatic_refresh_updates_weekly_and_monthly(monkeypatch) -> None:
    rows = [SimpleNamespace(period_type="weekly"), SimpleNamespace(period_type="monthly")]
    upsert = AsyncMock(side_effect=rows)
    monkeypatch.setattr("services.scorecards.upsert_scorecard", upsert)
    db = SimpleNamespace(
        scalars=AsyncMock(return_value=SimpleNamespace(all=lambda: [])),
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )
    result = await refresh_current_scorecards(db, "user-id", today=date(2026, 7, 29))
    assert result == rows
    assert [call.args[2] for call in upsert.await_args_list] == ["weekly", "monthly"]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_affected_course_is_automatically_refreshed(monkeypatch) -> None:
    book_id, set_id = uuid4(), uuid4()
    rows = [SimpleNamespace(period_type="weekly"), SimpleNamespace(period_type="monthly"), SimpleNamespace(period_type="course", metrics={})]
    upsert = AsyncMock(side_effect=rows)
    monkeypatch.setattr("services.scorecards.upsert_scorecard", upsert)
    db = SimpleNamespace(
        scalars=AsyncMock(side_effect=[SimpleNamespace(all=lambda: [book_id]), SimpleNamespace(all=lambda: [set_id])]),
        scalar=AsyncMock(side_effect=[None, None]), get=AsyncMock(return_value=SimpleNamespace(title="Biology")),
        commit=AsyncMock(), refresh=AsyncMock(),
    )
    result = await refresh_current_scorecards(db, "user-id", affected_set_id=set_id, today=date(2026, 7, 29))
    assert [row.period_type for row in result] == ["weekly", "monthly", "course"]
    course_call = upsert.await_args_list[2]
    assert course_call.args[2] == "course"
    assert course_call.kwargs == {"entity_id": str(book_id), "set_ids": [set_id]}
    assert result[2].metrics["course_title"] == "Biology"


@pytest.mark.asyncio
async def test_direct_revoke_share_and_public_retrieval_contract() -> None:
    from datetime import datetime, timedelta, UTC
    from uuid import uuid4
    from fastapi import HTTPException
    from routers.scorecards import revoke_share
    from services.scorecard_sharing import generate_token, token_hash, load_valid_share

    user_a_id = uuid4()
    user_b_id = uuid4()
    card_a_id = uuid4()
    card_b_id = uuid4()
    share_id = uuid4()

    token = generate_token()
    now = datetime.now(UTC)

    share = SimpleNamespace(
        id=share_id,
        scorecard_id=card_a_id,
        user_id=user_a_id,
        token_hash=token_hash(token),
        expires_at=now + timedelta(days=7),
        revoked_at=None,
        last_accessed_at=None,
        access_count=0,
    )
    card = SimpleNamespace(id=card_a_id, user_id=user_a_id)

    db = AsyncMock()

    import routers.scorecards
    original_owned = routers.scorecards._owned

    async def mock_owned(db_session, u_id, c_id):
        if u_id == user_a_id and c_id == card_a_id:
            return card
        raise HTTPException(status_code=404, detail="Scorecard not found")

    routers.scorecards._owned = mock_owned

    async def mock_scalar(query):
        if share.scorecard_id == card_a_id and share.user_id == user_a_id:
            return share
        return None

    db.scalar = AsyncMock(side_effect=mock_scalar)
    db.commit = AsyncMock()

    try:
        # 1. Owner can revoke an active share
        user_a = SimpleNamespace(id=user_a_id)
        res = await revoke_share(card_a_id, share_id, user_a, db)
        assert res == {"revoked": True}
        assert share.revoked_at is not None
        db.commit.assert_awaited_once()

        # 4. Repeated revoke returns {"revoked": True} without re-committing
        db.commit.reset_mock()
        res_repeat = await revoke_share(card_a_id, share_id, user_a, db)
        assert res_repeat == {"revoked": True}
        db.commit.assert_not_awaited()

        # 2. Non-owner cannot revoke
        user_b = SimpleNamespace(id=user_b_id)
        with pytest.raises(HTTPException) as exc_b:
            await revoke_share(card_a_id, share_id, user_b, db)
        assert exc_b.value.status_code == 404

        # 3. Share belonging to another scorecard cannot be revoked through mismatched scorecard ID
        with pytest.raises(HTTPException) as exc_mismatch:
            await revoke_share(card_b_id, share_id, user_a, db)
        assert exc_mismatch.value.status_code == 404

    finally:
        routers.scorecards._owned = original_owned


@pytest.mark.asyncio
async def test_public_retrieval_before_and_after_revoke_and_expiry() -> None:
    from datetime import datetime, timedelta, UTC
    from uuid import uuid4
    from services.scorecard_sharing import generate_token, token_hash, load_valid_share

    token = generate_token()
    now = datetime.now(UTC)
    user_id = uuid4()
    card_id = uuid4()

    # Active share
    share = SimpleNamespace(
        user_id=user_id,
        scorecard_id=card_id,
        token_hash=token_hash(token),
        expires_at=now + timedelta(days=7),
        revoked_at=None,
        last_accessed_at=None,
        access_count=0,
    )
    card = SimpleNamespace(id=card_id, user_id=user_id)

    db = AsyncMock()

    # 6. Public retrieval succeeds before revoke
    mock_row = SimpleNamespace(one_or_none=lambda: (share, card))
    db.execute = AsyncMock(return_value=mock_row)
    db.commit = AsyncMock()

    result = await load_valid_share(db, token)
    assert result == (share, card)

    # 7. The same public token returns None (404) immediately after revoke
    share.revoked_at = now
    mock_revoked_row = SimpleNamespace(one_or_none=lambda: None)
    db.execute = AsyncMock(return_value=mock_revoked_row)

    result_revoked = await load_valid_share(db, token)
    assert result_revoked is None

    # 8. Revoked token cannot become valid again
    result_again = await load_valid_share(db, token)
    assert result_again is None

    # Expired token returns None
    expired_token = generate_token()
    expired_share = SimpleNamespace(
        user_id=user_id,
        scorecard_id=card_id,
        token_hash=token_hash(expired_token),
        expires_at=now - timedelta(days=1),
        revoked_at=None,
    )
    mock_expired_row = SimpleNamespace(one_or_none=lambda: None)
    db.execute = AsyncMock(return_value=mock_expired_row)
    result_expired = await load_valid_share(db, expired_token)
    assert result_expired is None
