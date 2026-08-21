"""Credit management endpoints: balance, pricing, and purchase history."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from dependencies import get_current_user
from models.credit_purchase import CreditPurchase
from models.credit_ledger import CreditLedger
from models.user import User
from services import credits as credits_service

router = APIRouter(prefix="/credits", tags=["credits"])


class CreditBalance(BaseModel):
    """User's current credit balance."""
    total: int
    monthly: int
    purchased: int
    available_total: int
    plan: dict[str, int]
    purchased_position: dict[str, int]


class CreditPackTier(BaseModel):
    """A single purchasable extra-credit pack tier."""
    credits: int
    price_cents: int
    price_usd: float


class CreditPricing(BaseModel):
    """Discrete extra-credit pack tier list."""
    tiers: list[CreditPackTier]
    currency: str


class CreditPurchaseRecord(BaseModel):
    """Record of a past credit purchase (omits internal Stripe IDs for privacy)."""
    id: UUID
    quantity: int
    amount_paid_cents: int
    currency: str
    unit_price_cents: int
    created_at: str
    status: str
    receipt_url: str | None = None


class CreditBalanceResponse(BaseModel):
    """Response with current credit balance."""
    balance: CreditBalance


class CreditPricingResponse(BaseModel):
    """Response with active credit pricing."""
    pricing: CreditPricing


class PurchaseHistoryResponse(BaseModel):
    """Response with user's purchase history."""
    purchases: list[CreditPurchaseRecord]
    total_purchases: int


class CreditUsageRecord(BaseModel):
    id: UUID
    amount: int
    pool: str
    reason: str
    metadata: dict | None = None
    expires_at: str | None = None
    created_at: str


class CreditUsageResponse(BaseModel):
    entries: list[CreditUsageRecord]


@router.get("/balance", response_model=CreditBalanceResponse, status_code=status.HTTP_200_OK)
async def get_credit_balance(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CreditBalanceResponse:
    """Get current credit balance for the authenticated user.

    Returns total balance, monthly allowance balance, and purchased credits balance.
    """
    snapshot = await credits_service.get_credit_accounting_snapshot(db, current_user.id, pool="content")

    return CreditBalanceResponse(
        balance=CreditBalance(
            total=snapshot["available_total"],
            monthly=snapshot["plan"]["remaining"],
            purchased=snapshot["purchased"]["remaining"],
            available_total=snapshot["available_total"],
            plan=snapshot["plan"],
            purchased_position=snapshot["purchased"],
        )
    )


@router.get("/pricing", response_model=CreditPricingResponse, status_code=status.HTTP_200_OK)
async def get_credit_pricing() -> CreditPricingResponse:
    """Get the configured extra-credit pack tiers."""
    currency = (settings.CREDIT_CURRENCY or "usd").lower()
    tiers = [
        CreditPackTier(
            credits=tier["credits"],
            price_cents=tier["price_cents"],
            price_usd=round(tier["price_cents"] / 100.0, 2),
        )
        for tier in sorted(credits_service.credit_pack_tiers(), key=lambda t: t["credits"])
    ]
    return CreditPricingResponse(
        pricing=CreditPricing(
            tiers=tiers,
            currency=currency,
        )
    )


@router.get("/packages", response_model=CreditPricingResponse, status_code=status.HTTP_200_OK)
async def get_credit_packages() -> CreditPricingResponse:
    """Backward-compatible alias for quantity pricing."""
    return await get_credit_pricing()


@router.get("/purchase-history", response_model=PurchaseHistoryResponse, status_code=status.HTTP_200_OK)
async def get_purchase_history(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PurchaseHistoryResponse:
    """Get the user's credit purchase history.

    Returns all credit purchases ordered by most recent first.
    """
    q = (
        select(CreditPurchase)
        .where(CreditPurchase.user_id == current_user.id)
        .order_by(desc(CreditPurchase.created_at))
    )

    r = await db.execute(q)
    purchases = r.scalars().all()

    purchase_records = [
        CreditPurchaseRecord(
            id=p.id,
            quantity=p.quantity,
            amount_paid_cents=p.amount_paid_cents,
            currency=p.currency,
            unit_price_cents=p.unit_price_cents,
            created_at=p.created_at.isoformat() if p.created_at else "",
            status=p.status,
            receipt_url=p.receipt_url,
        )
        for p in purchases
    ]

    return PurchaseHistoryResponse(
        purchases=purchase_records,
        total_purchases=len(purchase_records),
    )


@router.get("/usage", response_model=CreditUsageResponse, status_code=status.HTTP_200_OK)
async def get_credit_usage(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CreditUsageResponse:
    """Return the authenticated user's credit awards and consumption history."""
    rows = (
        await db.execute(
            select(CreditLedger)
            .where(CreditLedger.user_id == current_user.id)
            .order_by(desc(CreditLedger.created_at))
            .limit(200),
        )
    ).scalars().all()
    return CreditUsageResponse(
        entries=[
            CreditUsageRecord(
                id=row.id,
                amount=row.amount,
                pool=row.pool,
                reason=row.reason,
                metadata=row.meta,
                expires_at=row.expires_at.isoformat() if row.expires_at else None,
                created_at=row.created_at.isoformat(),
            )
            for row in rows
        ],
    )
