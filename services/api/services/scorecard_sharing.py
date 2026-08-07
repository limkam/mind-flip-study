"""Privacy-safe scorecard share tokens and server-rendered public views."""

from __future__ import annotations

import hashlib
import html
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.engagement import Scorecard, ScorecardShare

TOKEN_BYTES = 32
TOKEN_MIN_LENGTH = 43
TOKEN_MAX_LENGTH = 64
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{43,64}$")
PERIOD_LABELS = {"weekly": "Weekly", "monthly": "Monthly", "course": "Course"}
PUBLIC_COMPONENTS = {
    "accuracy": "Accuracy",
    "consistency": "Consistency",
    "activity": "Assessment activity",
    "healthy_time": "Healthy learning time",
}


def generate_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def valid_token_shape(token: str) -> bool:
    return TOKEN_MIN_LENGTH <= len(token) <= TOKEN_MAX_LENGTH and TOKEN_RE.fullmatch(token) is not None


@dataclass(frozen=True)
class PublicScorecardView:
    period_label: str
    score: int
    formula_version: str
    period_start: str
    period_end: str
    data_state: str
    assessments: int
    average: float | None
    cards_reviewed: int
    active_days: int
    learning_minutes: int
    current_streak: int
    components: tuple[tuple[str, int], ...]
    personal_best: bool
    comparison_direction: str | None
    display_name: str | None
    public_message: str | None
    course_title: str | None


def _bounded_int(value: object, minimum: int = 0, maximum: int = 1_000_000) -> int:
    try:
        return max(minimum, min(maximum, int(value or 0)))
    except (TypeError, ValueError):
        return minimum


def _bounded_score(value: object) -> int:
    return _bounded_int(value, 0, 100)


def public_view(share: ScorecardShare, card: Scorecard) -> PublicScorecardView:
    """Build the sole allowlisted model passed to public renderers."""
    metrics = card.metrics if isinstance(card.metrics, dict) else {}
    component_values = metrics.get("component_scores") if isinstance(metrics.get("component_scores"), dict) else {}
    components = tuple((label, _bounded_score(component_values.get(key))) for key, label in PUBLIC_COMPONENTS.items())
    comparison = metrics.get("comparison") if isinstance(metrics.get("comparison"), dict) else {}
    direction = comparison.get("direction") if comparison.get("direction") in {"up", "down", "flat"} else None
    average_value = metrics.get("average_assessment_score")
    try:
        average = max(0.0, min(100.0, float(average_value))) if average_value is not None else None
    except (TypeError, ValueError):
        average = None
    state = metrics.get("data_state") if metrics.get("data_state") in {"empty", "partial", "complete"} else "partial"
    course_title = None
    if card.period_type == "course" and isinstance(metrics.get("course_title"), str):
        course_title = metrics["course_title"].strip()[:120] or None
    return PublicScorecardView(
        period_label=PERIOD_LABELS.get(card.period_type, "Learning"),
        score=_bounded_score(card.score),
        formula_version=str(card.formula_version or "unknown")[:24],
        period_start=card.period_start.isoformat(),
        period_end=card.period_end.isoformat(),
        data_state=state,
        assessments=_bounded_int(metrics.get("assessments_completed")),
        average=average,
        cards_reviewed=_bounded_int(metrics.get("cards_reviewed")),
        active_days=_bounded_int(metrics.get("active_days"), maximum=366),
        learning_minutes=_bounded_int(metrics.get("learning_minutes")),
        current_streak=_bounded_int(metrics.get("current_streak"), maximum=100_000),
        components=components,
        personal_best=metrics.get("personal_best") is True,
        comparison_direction=direction,
        display_name=share.public_display_name if share.show_display_name else None,
        public_message=share.public_message,
        course_title=course_title,
    )


async def load_valid_share(db: AsyncSession, token: str, *, record_access: bool = True) -> tuple[ScorecardShare, Scorecard] | None:
    if not valid_token_shape(token):
        return None
    now = datetime.now(UTC)
    row = (await db.execute(
        select(ScorecardShare, Scorecard)
        .join(Scorecard, Scorecard.id == ScorecardShare.scorecard_id)
        .where(
            ScorecardShare.token_hash == token_hash(token),
            ScorecardShare.revoked_at.is_(None),
            ScorecardShare.expires_at > now,
            ScorecardShare.user_id == Scorecard.user_id,
        )
        .limit(1)
    )).one_or_none()
    if row is None:
        return None
    share, card = row
    if record_access:
        share.last_accessed_at = now
        share.access_count = int(share.access_count or 0) + 1
        await db.commit()
    return share, card


def page_title(view: PublicScorecardView) -> str:
    return f"{view.period_label} Learning Scorecard"


def page_description(view: PublicScorecardView) -> str:
    if view.data_state == "empty":
        return "This learning scorecard contains limited activity for the selected period."
    lead = f"A {view.period_label.lower()} learning scorecard with an overall score of {view.score}"
    if view.data_state == "partial":
        return f"{lead} and limited activity data for the selected period."
    return f"{lead}, showing progress, consistency, and assessment performance."


def format_period_human(start_iso: str, end_iso: str) -> str:
    try:
        s = date.fromisoformat(start_iso)
        e = date.fromisoformat(end_iso)
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        if s == e:
            return f"{months[s.month - 1]} {s.day}, {s.year}"
        if s.year == e.year:
            return f"{months[s.month - 1]} {s.day} – {months[e.month - 1]} {e.day}, {e.year}"
        return f"{months[s.month - 1]} {s.day}, {s.year} – {months[e.month - 1]} {e.day}, {e.year}"
    except (ValueError, TypeError):
        return f"{start_iso} – {end_iso}"


def security_headers() -> dict[str, str]:
    return {
        "Cache-Control": "private, no-store, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "Vary": "Accept-Encoding",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    }


def render_html(view: PublicScorecardView, canonical_url: str, image_url: str, app_url: str) -> str:
    def esc(value: object) -> str:
        return html.escape(str(value), quote=True)
    title, description = page_title(view), page_description(view)
    name = f'<p class="name">Shared by {esc(view.display_name)}</p>' if view.display_name else ""
    course = f'<p class="course">{esc(view.course_title)}</p>' if view.course_title else ""
    message = f'<blockquote>{esc(view.public_message)}</blockquote>' if view.public_message else ""
    state = '<p class="notice">This scorecard contains limited activity for the selected period.</p>' if view.data_state != "complete" else ""
    average = "—" if view.average is None else f"{round(view.average)}%"
    metrics = (("Assessments", view.assessments), ("Average", average), ("Cards reviewed", view.cards_reviewed), ("Study time", f"{view.learning_minutes} min"))
    metric_html = "".join(f'<div class="metric"><strong>{esc(value)}</strong><span>{esc(label)}</span></div>' for label, value in metrics)
    component_html = "".join(f'<li><span>{esc(label)}</span><strong>{score}/100</strong></li>' for label, score in view.components)
    badges = ""
    if view.personal_best:
        badges += '<span class="badge">Personal best</span>'
    if view.comparison_direction:
        comparison_label = {"up": "Improved", "down": "Declined", "flat": "Unchanged"}[view.comparison_direction]
        badges += f'<span class="badge">{comparison_label} from prior period</span>'
    formatted_date_range = format_period_human(view.period_start, view.period_end)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)} | MindFlip</title><meta name="description" content="{esc(description)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="MindFlip"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}"><meta property="og:image" content="{esc(image_url)}"><meta property="og:image:alt" content="{esc(title)}"><meta property="og:url" content="{esc(canonical_url)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{esc(title)}"><meta name="twitter:description" content="{esc(description)}"><meta name="twitter:image" content="{esc(image_url)}"><link rel="canonical" href="{esc(canonical_url)}">
<style>*{{box-sizing:border-box}}body{{margin:0;background:#f5f3ff;color:#fff;font:16px system-ui,-apple-system,sans-serif}}main{{min-height:100vh;display:grid;place-items:center;padding:24px}}article{{width:min(760px,100%);border-radius:38px;padding:clamp(28px,7vw,60px);background:linear-gradient(145deg,#4f46e5,#7c3aed 54%,#c026d3);box-shadow:0 24px 70px #312e8155}}header{{display:flex;justify-content:space-between;gap:16px;align-items:center}}.brand{{font-weight:900;letter-spacing:.16em}}.period,.badge{{background:#ffffff24;border-radius:999px;padding:10px 18px;font-weight:700}}h1{{font-size:clamp(34px,7vw,60px);line-height:1.04;margin:54px 0 8px}}.name,.course{{font-size:20px;margin:8px 0;overflow-wrap:anywhere}}.score{{font-size:clamp(72px,16vw,132px);font-weight:900;line-height:1;margin:34px 0 8px}}.score small{{font-size:20px;color:#ffffffcc}}.grid{{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:34px 0}}.metric{{background:#ffffff20;border-radius:22px;padding:22px;text-align:center;display:grid;gap:6px}}.metric strong{{font-size:28px}}.metric span,.meta{{color:#ffffffd9}}ul{{list-style:none;padding:0;margin:24px 0}}li{{display:flex;justify-content:space-between;border-bottom:1px solid #ffffff35;padding:12px 0}}.badges{{display:flex;flex-wrap:wrap;gap:8px}}blockquote,.notice{{margin:24px 0;padding:16px;border-left:4px solid #fff;background:#ffffff18}}footer{{margin-top:36px;border-top:1px solid #ffffff45;padding-top:24px}}a{{color:#fff;font-weight:800}}@media(max-width:480px){{.grid{{grid-template-columns:1fr}}}}</style></head>
<body><main><article><header><span class="brand">🎓 MINDFLIP</span><span class="period">{esc(view.period_label)}</span></header><h1>{esc(title)}</h1><p class="meta">{esc(formatted_date_range)}</p><div class="score">{view.score}<small>/100</small></div>{state}<div class="grid">{metric_html}</div><section aria-labelledby="components"><h2 id="components">Learning summary</h2><ul>{component_html}</ul></section><div class="badges">{badges}</div>{message}{name}{course}<footer><a href="{esc(app_url)}">Continue learning with MindFlip &rarr;</a></footer></article></main></body></html>'''


def render_svg(view: PublicScorecardView) -> str:
    def esc(value: object) -> str:
        return html.escape(str(value), quote=True)
    title = page_title(view)
    formatted_date_range = format_period_human(view.period_start, view.period_end)
    subtitle = f"{formatted_date_range} · {view.assessments} assessments · {view.cards_reviewed} cards reviewed"
    display = f'<text x="90" y="225" fill="#fff" font-size="34" font-weight="700">Shared by {esc(view.display_name)}</text>' if view.display_name else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="{esc(title)}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4f46e5"/><stop offset=".55" stop-color="#7c3aed"/><stop offset="1" stop-color="#c026d3"/></linearGradient></defs><rect width="1200" height="630" rx="48" fill="url(#g)"/><text x="90" y="100" fill="#fff" font-family="system-ui,sans-serif" font-size="30" font-weight="900" letter-spacing="5">MINDFLIP</text><text x="90" y="175" fill="#fff" font-family="system-ui,sans-serif" font-size="48" font-weight="800">{esc(title)}</text>{display}<text x="90" y="430" fill="#fff" font-family="system-ui,sans-serif" font-size="190" font-weight="900">{view.score}</text><text x="390" y="425" fill="#ffffffcc" font-family="system-ui,sans-serif" font-size="38">/ 100 learning score</text><text x="90" y="535" fill="#ffffffdd" font-family="system-ui,sans-serif" font-size="28">{esc(subtitle)}</text></svg>'''
