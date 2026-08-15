"""Canonical operational control-center endpoints."""

from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import Date, String, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_role
from models.admin_observability import AdminAuditLog, UserActivityEvent
from models.billing_analytics import BillingEvent, BillingInvoice
from models.book import Book
from models.credit_ledger import CreditLedger
from models.credit_purchase import CreditPurchase
from models.enums import UserRole
from models.feedback import SupportConversation, SupportMessage
from models.flashcard import Flashcard, FlashcardSet, Workbook
from models.plan import Plan
from models.quiz import QuizResult, StudyEvent
from models.token_usage import TokenUsage
from models.user import User
from models.user_subscription import UserSubscription
from models.xp import XPTransaction
from services.credits import get_credit_accounting_snapshot, _split_pool_balances
from services.subscription_monitoring import subscription_time_state, trial_time_state
from services.admin_metrics import rank_plan_counts
from services.admin_cache import cached_admin_response

router = APIRouter(tags=["admin-control-center"])
ACTIVE = ("active", "trialing", "past_due", "canceled")


async def _subscription_rows(db: AsyncSession, user_ids: list[UUID] | None = None):
    stmt = select(UserSubscription, Plan).join(Plan, Plan.id == UserSubscription.plan_id)
    if user_ids is not None:
        stmt = stmt.where(UserSubscription.user_id.in_(user_ids))
    rows = (await db.execute(stmt.order_by(UserSubscription.current_period_end.desc().nullslast(), UserSubscription.created_at.desc()))).all()
    grouped: dict[UUID, list[tuple[UserSubscription, Plan]]] = {}
    for sub, plan in rows:
        grouped.setdefault(sub.user_id, []).append((sub, plan))
    return grouped


def _resolved(group):
    now = datetime.now(UTC)
    entitled = [(s, p) for s, p in group if s.status in ACTIVE and s.current_period_end is not None and s.current_period_end > now]
    ids = {s.stripe_subscription_id for s, _ in entitled if s.stripe_subscription_id}
    if len(ids) > 1:
        return None, None, True
    if entitled:
        return entitled[0][0], entitled[0][1], False
    return None, None, False


@router.get("/plan-rankings")
@cached_admin_response("plan-rankings", ttl=60)
async def plan_rankings(request: Request, _admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    users = list((await db.scalars(select(User).where(User.role != UserRole.admin))).all())
    catalog = list((await db.scalars(select(Plan).order_by(Plan.name))).all())
    groups = await _subscription_rows(db, [u.id for u in users])
    counts: dict[str, int] = {plan.name: 0 for plan in catalog}
    counts.setdefault("Free", 0)
    trials: dict[str, int] = {}
    conflicts = 0
    for user in users:  # banned accounts remain: this is registered customer distribution
        sub, plan, conflict = _resolved(groups.get(user.id, []))
        if conflict:
            conflicts += 1
            continue
        label = plan.name if plan else "Free"
        counts[label] = counts.get(label, 0) + 1
        if sub and sub.status == "trialing":
            trials[label] = trials.get(label, 0) + 1
    return {"population_definition": "Non-admin registered customer accounts; banned users included; billing conflicts excluded.", "trial_counts": trials, **rank_plan_counts(counts, conflicts=conflicts)}


@router.get("/subscriptions")
async def subscriptions(_admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)], q: str = "", plan: str = "", status: str = "", trial: bool | None = None, canceling: bool | None = None, expiring_days: int | None = Query(None, ge=1, le=365), conflict: bool | None = None, page: int = Query(1, ge=1), size: int = Query(25, ge=1, le=100)):
    user_stmt = select(User).where(User.role != UserRole.admin)
    if q.strip():
        like = f"%{q.strip()}%"; user_stmt = user_stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like)))
    users = list((await db.scalars(user_stmt.order_by(User.created_at.desc()))).all())
    groups = await _subscription_rows(db, [u.id for u in users])
    now = datetime.now(UTC); items = []
    for user in users:
        group = groups.get(user.id, [])
        sub, plan_row, has_conflict = _resolved(group)
        record_sub = sub or (group[0][0] if group else None)
        label = plan_row.name if plan_row else "Free"
        sub_status = record_sub.status if record_sub else "free"
        cancel_flag = bool(record_sub and (record_sub.cancel_at_period_end or record_sub.status == "canceled") and record_sub.current_period_end and record_sub.current_period_end > now)
        if plan and label != plan: continue
        if status and sub_status != status: continue
        if trial is not None and bool(record_sub and trial_time_state(record_sub)["active"]) != trial: continue
        if canceling is not None and cancel_flag != canceling: continue
        if conflict is not None and has_conflict != conflict: continue
        if expiring_days is not None and not (record_sub and record_sub.current_period_end and now < record_sub.current_period_end <= now + timedelta(days=expiring_days)): continue
        items.append({"user_id": str(user.id), "user": user.full_name, "email": user.email, "plan": label, "status": "billing_conflict" if has_conflict else sub_status, "entitlement": "unavailable" if has_conflict else (label if sub else "Free"), "started_at": record_sub.subscription_started_at if record_sub else None, "period_start": record_sub.current_period_start if record_sub else None, "period_end": record_sub.current_period_end if record_sub else None, "time": subscription_time_state(record_sub, conflict=has_conflict), "trial": trial_time_state(record_sub), "auto_renew": bool(sub and not cancel_flag), "cancel_at_period_end": cancel_flag, "conflict": has_conflict})
    summary = {"total_users": len(users), "free_users": sum(x["plan"] == "Free" for x in items), "paying_users": sum(x["plan"] != "Free" and not x["conflict"] for x in items), "active": sum(x["status"] == "active" for x in items), "trialing": sum(x["status"] == "trialing" for x in items), "canceling": sum(x["cancel_at_period_end"] for x in items), "past_due": sum(x["status"] == "past_due" for x in items), "expired": sum(x["status"] in ("canceled", "unpaid", "incomplete_expired") and x["time"]["kind"] == "expired" for x in items), "conflicts": sum(x["conflict"] for x in items)}
    return {"items": items[(page-1)*size:page*size], "total": len(items), "page": page, "size": size, "summary": summary, "updated_at": now}


@router.get("/users/{user_id}")
async def user_detail(user_id: UUID, _admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    user = await db.get(User, user_id)
    if not user: raise HTTPException(404, "User not found")
    groups = await _subscription_rows(db, [user_id]); group=groups.get(user_id, []); sub, plan, conflict = _resolved(group); record_sub=sub or (group[0][0] if group else None)
    content_plan, purchased = await _split_pool_balances(db, user_id, pool="content")
    regen_plan, _ = await _split_pool_balances(db, user_id, pool="regen")
    accounting = await get_credit_accounting_snapshot(db, user_id, pool="content")
    counts = (await db.execute(select(
        select(func.count(Book.id)).where(Book.user_id == user_id).scalar_subquery(),
        select(func.count(FlashcardSet.id)).where(FlashcardSet.user_id == user_id).scalar_subquery(),
        select(func.count(QuizResult.id)).where(QuizResult.user_id == user_id).scalar_subquery(),
        select(func.count(StudyEvent.id)).where(StudyEvent.user_id == user_id, StudyEvent.event_type == "review").scalar_subquery(),
        select(func.coalesce(func.sum(XPTransaction.amount), 0)).where(XPTransaction.user_id == user_id).scalar_subquery(),
        select(func.count(TokenUsage.id)).where(TokenUsage.user_id == user_id).scalar_subquery(),
        select(func.count(SupportConversation.id)).where(SupportConversation.user_id == user_id).scalar_subquery(),
        select(func.coalesce(func.sum(-CreditLedger.amount), 0)).where(CreditLedger.user_id == user_id, CreditLedger.amount < 0).scalar_subquery(),
    ))).one()
    now = datetime.now(UTC)
    active_days = {}
    for days in (7, 30):
        active_days[str(days)] = int(await db.scalar(select(func.count(func.distinct(cast(UserActivityEvent.occurred_at, Date)))).where(UserActivityEvent.user_id == user_id, UserActivityEvent.occurred_at >= now-timedelta(days=days))) or 0)
    invoices = list((await db.scalars(select(BillingInvoice).where(BillingInvoice.user_id == user_id).order_by(BillingInvoice.created_at.desc()).limit(50))).all())
    purchases = list((await db.scalars(select(CreditPurchase).where(CreditPurchase.user_id == user_id).order_by(CreditPurchase.created_at.desc()).limit(50))).all())
    ledger = list((await db.scalars(select(CreditLedger).where(CreditLedger.user_id == user_id).order_by(CreditLedger.created_at.desc()).limit(100))).all())
    return {"account": {"id": str(user.id), "name": user.full_name, "email": user.email, "role": user.role.value, "status": "banned" if user.is_banned else "active", "created_at": user.created_at, "onboarding_completed": user.onboarding_completed, "onboarding_started_at": user.onboarding_started_at, "onboarding_completed_at": user.onboarding_completed_at, "last_active_at": user.last_active_at, "auth_provider": user.auth_provider, "country": user.country, "continent": user.continent, "occupation": user.occupation, "job_title": user.job_title, "push_platform": user.push_platform}, "subscription": {"plan": plan.name if plan else "Free", "status": "billing_conflict" if conflict else (record_sub.status if record_sub else "free"), "entitlement": "unavailable" if conflict else (plan.slug if plan else "free"), "stripe_customer_id": user.stripe_customer_id, "stripe_subscription_id": record_sub.stripe_subscription_id if record_sub else None, "billing_interval": record_sub.billing_interval if record_sub else None, "subscription_started_at": record_sub.subscription_started_at if record_sub else None, "current_period_start": record_sub.current_period_start if record_sub else None, "current_period_end": record_sub.current_period_end if record_sub else None, "cancel_at_period_end": bool(record_sub and record_sub.cancel_at_period_end), "cancel_at": record_sub.cancel_at if record_sub else None, "canceled_at": record_sub.canceled_at if record_sub else None, "trial_start": record_sub.trial_start if record_sub else None, "trial_end": record_sub.trial_end if record_sub else None, "pause_collection": record_sub.pause_collection if record_sub else None, "time": subscription_time_state(record_sub, conflict=conflict), "trial": trial_time_state(record_sub), "conflict": conflict, "last_sync_at": record_sub.stripe_event_created_at if record_sub else None}, "credits": {"content_plan_remaining": content_plan, "purchased_remaining": purchased, "regen_plan_remaining": regen_plan, **accounting}, "activity": {"active_days_7": active_days["7"], "active_days_30": active_days["30"], "books": counts[0], "flashcard_sets": counts[1], "quizzes": counts[2], "reviews": counts[3], "xp": counts[4], "ai_generations": counts[5], "support_conversations": counts[6], "credits_consumed": counts[7]}, "invoices": [{"id": x.stripe_invoice_id, "status": x.status, "amount_due_cents": x.amount_due_cents, "amount_paid_cents": x.amount_paid_cents, "amount_refunded_cents": x.amount_refunded_cents, "currency": x.currency, "paid_at": x.paid_at, "period_start": x.period_start, "period_end": x.period_end} for x in invoices], "credit_purchases": [{"id": str(x.id), "quantity": x.quantity, "amount_paid_cents": x.amount_paid_cents, "currency": x.currency, "status": x.status, "receipt_url": x.receipt_url, "created_at": x.created_at} for x in purchases], "credit_ledger": [{"id": str(x.id), "amount": x.amount, "pool": x.pool, "reason": x.reason, "expires_at": x.expires_at, "created_at": x.created_at, "metadata": x.meta} for x in ledger]}


@router.get("/audit-log")
async def audit_logs(_admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)], q: str = "", action: str = "", resource: str = "", admin_id: UUID | None = None, date_from: date | None = None, date_to: date | None = None, page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=100)):
    filters = []
    if q.strip(): filters.append(or_(AdminAuditLog.admin_email.ilike(f"%{q.strip()}%"), cast(AdminAuditLog.affected_user_id, String).ilike(f"%{q.strip()}%")))
    if action: filters.append(AdminAuditLog.action == action)
    if resource: filters.append(AdminAuditLog.target_resource_type == resource)
    if admin_id: filters.append(AdminAuditLog.admin_user_id == admin_id)
    if date_from: filters.append(AdminAuditLog.created_at >= datetime.combine(date_from, time.min, tzinfo=UTC))
    if date_to: filters.append(AdminAuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC))
    total = int(await db.scalar(select(func.count(AdminAuditLog.id)).where(*filters)) or 0)
    rows = list((await db.scalars(select(AdminAuditLog).where(*filters).order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).offset((page-1)*size).limit(size))).all())
    return {"items": [{"id": str(x.id), "admin_user_id": str(x.admin_user_id) if x.admin_user_id else None, "admin_email": x.admin_email, "action": x.action, "resource_type": x.target_resource_type, "resource_id": x.target_resource_id, "affected_user_id": str(x.affected_user_id) if x.affected_user_id else None, "request_id": x.request_id, "previous": x.previous_value, "new": x.new_value, "reason": x.reason, "metadata": x.metadata_, "ip_address": x.ip_address, "created_at": x.created_at} for x in rows], "total": total, "page": page, "size": size}


@router.get("/onboarding-analytics")
@cached_admin_response("onboarding-analytics", ttl=60)
async def onboarding_analytics(request: Request, _admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    today = datetime.now(UTC).date(); start = datetime.combine(today-timedelta(days=29), time.min, tzinfo=UTC)
    reg_rows = (await db.execute(select(cast(User.created_at, Date), func.count(User.id)).where(User.created_at >= start).group_by(cast(User.created_at, Date)))).all()
    start_rows = (await db.execute(select(cast(User.onboarding_started_at, Date), func.count(User.id)).where(User.onboarding_started_at >= start).group_by(cast(User.onboarding_started_at, Date)))).all()
    done_rows = (await db.execute(select(cast(User.onboarding_completed_at, Date), func.count(User.id)).where(User.onboarding_completed_at >= start).group_by(cast(User.onboarding_completed_at, Date)))).all()
    maps = [{r[0]: int(r[1]) for r in rows} for rows in (reg_rows, start_rows, done_rows)]
    daily = [{"date": (today-timedelta(days=29-i)).isoformat(), "registrations": maps[0].get(today-timedelta(days=29-i), 0), "started": maps[1].get(today-timedelta(days=29-i), 0), "completed": maps[2].get(today-timedelta(days=29-i), 0)} for i in range(30)]
    def period(days, offset=0):
        subset = daily[max(0, 30-offset-days):30-offset]; regs=sum(x["registrations"] for x in subset); done=sum(x["completed"] for x in subset)
        return {"registrations": regs, "started": sum(x["started"] for x in subset), "completed": done, "completion_pct": round(done/regs*100, 1) if regs else 0}
    return {"timezone": "UTC", "instrumentation_started": start, "today": period(1), "yesterday": period(1,1), "last_7_days": period(7), "last_30_days": period(30), "daily": daily}


@router.get("/activity-analytics")
@cached_admin_response("activity-analytics", ttl=45)
async def activity_analytics(request: Request, _admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    now=datetime.now(UTC); today=now.date(); daily=[]
    for i in range(30):
        d=today-timedelta(days=29-i); a=datetime.combine(d,time.min,tzinfo=UTC); b=a+timedelta(days=1)
        daily.append({"date":d.isoformat(), "active_users":int(await db.scalar(select(func.count(func.distinct(UserActivityEvent.user_id))).join(User,User.id==UserActivityEvent.user_id).where(User.role!=UserRole.admin,UserActivityEvent.occurred_at>=a,UserActivityEvent.occurred_at<b)) or 0)})
    async def active(days): return int(await db.scalar(select(func.count(func.distinct(UserActivityEvent.user_id))).join(User,User.id==UserActivityEvent.user_id).where(User.role!=UserRole.admin,UserActivityEvent.occurred_at>=now-timedelta(days=days))) or 0)
    mau=await active(30)
    returning=int(await db.scalar(select(func.count()).select_from(select(UserActivityEvent.user_id).join(User,User.id==UserActivityEvent.user_id).where(User.role!=UserRole.admin,UserActivityEvent.occurred_at>=now-timedelta(days=30)).group_by(UserActivityEvent.user_id).having(func.count(func.distinct(cast(UserActivityEvent.occurred_at,Date)))>1).subquery())) or 0)
    inactive=int(await db.scalar(select(func.count(User.id)).where(User.role!=UserRole.admin, or_(User.last_active_at.is_(None),User.last_active_at<now-timedelta(days=30)))) or 0)
    return {"definition":"Distinct non-polling meaningful authenticated activity events, UTC rolling windows.","dau":await active(1),"wau":await active(7),"mau":mau,"returning_users_30d":returning,"inactive_users_30d":inactive,"daily":daily,"updated_at":now}


@router.get("/billing-operations")
async def billing_operations(_admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)], page:int=Query(1,ge=1), size:int=Query(50,ge=1,le=100)):
    failed=int(await db.scalar(select(func.count(BillingEvent.id)).where(BillingEvent.status=="failed")) or 0); retries=int(await db.scalar(select(func.coalesce(func.sum(case((BillingEvent.attempts>1,BillingEvent.attempts-1),else_=0)),0))) or 0)
    event_total=int(await db.scalar(select(func.count(BillingEvent.id)).where(BillingEvent.status!="succeeded")) or 0)
    invoice_total=int(await db.scalar(select(func.count(BillingInvoice.id))) or 0)
    purchase_total=int(await db.scalar(select(func.count(CreditPurchase.id))) or 0)
    failed_invoices=int(await db.scalar(select(func.count(BillingInvoice.id)).where(BillingInvoice.status.not_in(("paid","refunded","partially_refunded")))) or 0)
    refunds=int(await db.scalar(select(func.count(BillingInvoice.id)).where(BillingInvoice.amount_refunded_cents>0)) or 0)
    events=list((await db.scalars(select(BillingEvent).where(BillingEvent.status!="succeeded").order_by(BillingEvent.received_at.desc()).offset((page-1)*size).limit(size))).all())
    invoices=list((await db.scalars(select(BillingInvoice).order_by(BillingInvoice.created_at.desc()).offset((page-1)*size).limit(size))).all())
    purchases=list((await db.scalars(select(CreditPurchase).order_by(CreditPurchase.created_at.desc()).offset((page-1)*size).limit(size))).all())
    groups=await _subscription_rows(db); conflicts=sum(_resolved(v)[2] for v in groups.values())
    return {"summary":{"failed_webhooks":failed,"webhook_retries":retries,"billing_conflicts":conflicts,"failed_invoices":failed_invoices,"refunds":refunds},"events":[{"id":x.stripe_event_id,"type":x.event_type,"status":x.status,"attempts":x.attempts,"error":x.error,"received_at":x.received_at,"processed_at":x.processed_at} for x in events],"invoices":[{"id":x.stripe_invoice_id,"user_id":str(x.user_id),"status":x.status,"paid":x.amount_paid_cents,"refunded":x.amount_refunded_cents,"currency":x.currency,"paid_at":x.paid_at} for x in invoices],"credit_purchases":[{"id":str(x.id),"user_id":str(x.user_id),"quantity":x.quantity,"paid":x.amount_paid_cents,"status":x.status,"created_at":x.created_at} for x in purchases],"pagination":{"page":page,"size":size,"events_total":event_total,"invoices_total":invoice_total,"credit_purchases_total":purchase_total}}


@router.get("/leaderboards")
@cached_admin_response("leaderboards", ttl=120)
async def leaderboard_monitoring(request: Request, _admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    now=datetime.now(UTC); day=now-timedelta(days=1); week=now-timedelta(days=7)
    totals=(await db.execute(select(func.count(func.distinct(XPTransaction.user_id)),func.coalesce(func.sum(XPTransaction.amount).filter(XPTransaction.created_at>=day),0),func.coalesce(func.sum(XPTransaction.amount).filter(XPTransaction.created_at>=week),0)))).one()
    top=(await db.execute(select(XPTransaction.user_id,User.email,func.sum(XPTransaction.amount).label("xp"),func.count(XPTransaction.id).label("events")).join(User,User.id==XPTransaction.user_id).where(XPTransaction.created_at>=week).group_by(XPTransaction.user_id,User.email).order_by(func.sum(XPTransaction.amount).desc()).limit(50))).all()
    sources=(await db.execute(select(XPTransaction.source_type,func.sum(XPTransaction.amount)).where(XPTransaction.created_at>=week).group_by(XPTransaction.source_type))).all()
    return {"all_time_participants":int(totals[0] or 0),"xp_today":int(totals[1] or 0),"xp_week":int(totals[2] or 0),"weekly_participants":len(top),"xp_by_source":[{"source":x[0],"xp":int(x[1] or 0)} for x in sources],"top_earners":[{"user_id":str(x[0]),"email":x[1],"xp":int(x[2]),"events":int(x[3]),"suspicious":int(x[2])>=5000 or int(x[3])>=500} for x in top],"anomaly_rule":"Flag >=5,000 XP or >=500 ledger entries in 7 days; informational only."}


@router.get("/content-stats")
@cached_admin_response("content-stats", ttl=120)
async def content_stats(request: Request, _admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    now=datetime.now(UTC); start=now-timedelta(days=30)
    totals=(await db.execute(select(func.count(Book.id),func.count(Book.id).filter(Book.created_at>=now-timedelta(days=1)),func.count(Book.id).filter(Book.created_at>=now-timedelta(days=7)),func.count(Book.id).filter(Book.created_at>=start),func.count(Book.id).filter(Book.is_flagged.is_(True))))).one()
    status_rows=(await db.execute(select(cast(Book.status,String),func.count(Book.id)).group_by(Book.status))).all()
    daily_rows=(await db.execute(select(cast(Book.created_at,Date),func.count(Book.id)).where(Book.created_at>=start).group_by(cast(Book.created_at,Date)))).all(); dm={x[0]:int(x[1]) for x in daily_rows}
    return {"total_books":int(totals[0]),"total_sets":int(await db.scalar(select(func.count(FlashcardSet.id))) or 0),"total_flashcards":int(await db.scalar(select(func.count(Flashcard.id))) or 0),"uploads_today":int(totals[1]),"uploads_7d":int(totals[2]),"uploads_30d":int(totals[3]),"flagged":int(totals[4]),"by_status":[{"status":x[0],"count":int(x[1])} for x in status_rows],"daily":[{"date":(now.date()-timedelta(days=29-i)).isoformat(),"uploads":dm.get(now.date()-timedelta(days=29-i),0)} for i in range(30)]}


@router.get("/content/{book_id}")
async def content_detail(book_id: UUID, _admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    row=(await db.execute(select(Book,User).join(User,User.id==Book.user_id).where(Book.id==book_id))).one_or_none()
    if not row: raise HTTPException(404,"Content not found")
    book,user=row
    sets=list((await db.scalars(select(FlashcardSet).where(FlashcardSet.book_id==book_id).order_by(FlashcardSet.created_at))).all())
    ai=(await db.execute(select(func.count(TokenUsage.id),func.coalesce(func.sum(TokenUsage.estimated_cost_usd),0),func.count(TokenUsage.id).filter(TokenUsage.status=="failed"),func.coalesce(func.sum(TokenUsage.input_tokens+TokenUsage.output_tokens),0)).where(TokenUsage.book_id==book_id))).one()
    return {"id":str(book.id),"type":"book","title":book.title,"author":book.author,"code":book.book_code,"uploader":{"id":str(user.id),"name":user.full_name,"email":user.email},"uploaded_at":book.created_at,"status":book.status.value,"flagged":book.is_flagged,"file_size_bytes":book.file_size_bytes,"related_sets":[{"id":str(x.id),"title":x.title,"created_at":x.created_at} for x in sets],"generated_resources":{"workbooks":int(await db.scalar(select(func.count(Workbook.id)).where(Workbook.book_id==book_id)) or 0)},"ai":{"calls":int(ai[0]),"estimated_cost_usd":round(float(ai[1]),4),"failures":int(ai[2]),"tokens":int(ai[3])},"processing_failure":(book.extras or {}).get("error")}


@router.get("/support-analytics")
@cached_admin_response("support-analytics", ttl=30)
async def support_analytics(request: Request, _admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    now=datetime.now(UTC); today=datetime.combine(now.date(),time.min,tzinfo=UTC)
    conv=(await db.execute(select(func.count(SupportConversation.id),func.count(SupportConversation.id).filter(SupportConversation.status=="open"),func.count(SupportConversation.id).filter(SupportConversation.status=="resolved"),func.count(SupportConversation.id).filter(SupportConversation.admin_unread_count>0),func.count(SupportConversation.id).filter(SupportConversation.created_at>=today)))).one()
    messages_today=int(await db.scalar(select(func.count(SupportMessage.id)).where(SupportMessage.created_at>=today)) or 0)
    first_user=select(SupportMessage.conversation_id.label("cid"),func.min(SupportMessage.created_at).label("first_user")).where(SupportMessage.sender_type=="user").group_by(SupportMessage.conversation_id).subquery()
    first_admin=select(SupportMessage.conversation_id.label("cid"),func.min(SupportMessage.created_at).label("first_admin")).where(SupportMessage.sender_type=="admin").group_by(SupportMessage.conversation_id).subquery()
    avg_response=await db.scalar(
        select(func.avg(func.extract("epoch", first_admin.c.first_admin - first_user.c.first_user)))
        .select_from(first_user)
        .join(first_admin, first_admin.c.cid == first_user.c.cid)
        .where(first_admin.c.first_admin >= first_user.c.first_user)
    )
    avg_resolution=await db.scalar(select(func.avg(func.extract("epoch",SupportConversation.resolved_at-SupportConversation.created_at))).where(SupportConversation.resolved_at.is_not(None)))
    return {"definition":"First response is first administrator message after the first user message in the conversation; reopen cycles are not yet separate.","total":int(conv[0]),"open":int(conv[1]),"resolved":int(conv[2]),"unread":int(conv[3]),"new_today":int(conv[4]),"messages_today":messages_today,"avg_first_response_seconds":round(float(avg_response),1) if avg_response is not None else None,"avg_resolution_seconds":round(float(avg_resolution),1) if avg_resolution is not None else None}


@router.get("/security")
async def security_monitoring(_admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    now=datetime.now(UTC); recent=now-timedelta(days=30)
    banned=int(await db.scalar(select(func.count(User.id)).where(User.is_banned.is_(True))) or 0)
    role_changes=list((await db.scalars(select(AdminAuditLog).where(AdminAuditLog.action.ilike("user.%role%"),AdminAuditLog.created_at>=recent).order_by(AdminAuditLog.created_at.desc()).limit(50))).all())
    destructive=list((await db.scalars(select(AdminAuditLog).where(AdminAuditLog.action.in_(("content.delete","content.flag")),AdminAuditLog.created_at>=recent).order_by(AdminAuditLog.created_at.desc()).limit(50))).all())
    high_credit=(await db.execute(select(CreditLedger.user_id,func.sum(-CreditLedger.amount).label("used")).where(CreditLedger.amount<0,CreditLedger.created_at>=now-timedelta(days=7)).group_by(CreditLedger.user_id).having(func.sum(-CreditLedger.amount)>=100).order_by(func.sum(-CreditLedger.amount).desc()).limit(50))).all()
    return {"banned_users":banned,"recent_role_changes":[{"admin":x.admin_email,"action":x.action,"user_id":str(x.affected_user_id),"created_at":x.created_at} for x in role_changes],"recent_destructive_actions":[{"admin":x.admin_email,"action":x.action,"resource_id":x.target_resource_id,"reason":x.reason,"created_at":x.created_at} for x in destructive],"suspicious_credit_usage":[{"user_id":str(x[0]),"credits_used_7d":int(x[1])} for x in high_credit],"credit_rule":"Informational flag at >=100 credits consumed in 7 days."}


@router.get("/credits")
async def credit_monitoring(_admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)], page:int=Query(1,ge=1), size:int=Query(50,ge=1,le=100)):
    now=datetime.now(UTC)
    rows=(await db.execute(select(CreditLedger.pool,func.coalesce(func.sum(CreditLedger.amount).filter(or_(CreditLedger.expires_at.is_(None),CreditLedger.expires_at>now)),0),func.coalesce(func.sum(CreditLedger.amount).filter(CreditLedger.amount>0),0),func.coalesce(func.sum(-CreditLedger.amount).filter(CreditLedger.amount<0),0)).group_by(CreditLedger.pool))).all()
    total=int(await db.scalar(select(func.count(CreditLedger.id))) or 0)
    recent=list((await db.scalars(select(CreditLedger).order_by(CreditLedger.created_at.desc()).offset((page-1)*size).limit(size))).all())
    return {"authority":"Append-only credit ledger; current balances exclude expired grants.","pools":[{"pool":x[0],"current_net":max(0,int(x[1])),"granted":int(x[2]),"consumed":int(x[3])} for x in rows],"items":[{"id":str(x.id),"user_id":str(x.user_id),"amount":x.amount,"pool":x.pool,"reason":x.reason,"expires_at":x.expires_at,"created_at":x.created_at,"metadata":x.meta} for x in recent],"total":total,"page":page,"size":size}


@router.get("/learning")
@cached_admin_response("learning", ttl=120)
async def learning_activity(request: Request, _admin: Annotated[User, Depends(require_role("admin"))], db: Annotated[AsyncSession, Depends(get_db)]):
    now=datetime.now(UTC); week=now-timedelta(days=7)
    metrics=(await db.execute(select(
        select(func.count(Flashcard.id)).scalar_subquery(),
        select(func.count(StudyEvent.id)).where(StudyEvent.event_type=="review").scalar_subquery(),
        select(func.count(QuizResult.id)).scalar_subquery(),
        select(func.coalesce(func.sum(QuizResult.total_questions),0)).scalar_subquery(),
        select(func.coalesce(func.sum(QuizResult.score),0)).scalar_subquery(),
    ))).one()
    weekly_reviews=int(await db.scalar(select(func.count(StudyEvent.id)).where(StudyEvent.event_type=="review",StudyEvent.created_at>=week)) or 0)
    mastered=int(await db.scalar(select(func.count()).select_from(select(StudyEvent.user_id,StudyEvent.card_id).where(StudyEvent.event_type=="review",StudyEvent.quality>=3).group_by(StudyEvent.user_id,StudyEvent.card_id).having(func.count(StudyEvent.id)>=3).subquery())) or 0)
    return {"flashcards_created":int(metrics[0]),"reviews_completed":int(metrics[1]),"reviews_7d":weekly_reviews,"quizzes_completed":int(metrics[2]),"questions_answered":int(metrics[3]),"correct_answers":int(metrics[4]),"mastered_card_estimate":mastered,"mastery_definition":"At least three successful review ledger events; current card-progress state remains authoritative per user."}
