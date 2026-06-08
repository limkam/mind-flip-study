#!/usr/bin/env python3
"""Create or update a local dev admin user (idempotent)."""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# Allow `python scripts/create_admin.py` from services/api
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from config import settings
from database import init_engine
from models.enums import UserRole
from models.user import User
from passwords import hash_password

DEFAULT_EMAIL = "admin@mindflip.local"
DEFAULT_PASSWORD = "Admin123!"


async def main() -> None:
    email = os.environ.get("ADMIN_EMAIL", DEFAULT_EMAIL).strip().lower()
    password = os.environ.get("ADMIN_PASSWORD", DEFAULT_PASSWORD)
    full_name = os.environ.get("ADMIN_FULL_NAME", "MindFlip Admin")

    init_engine(settings.DATABASE_URL)
    from database import AsyncSessionLocal

    assert AsyncSessionLocal is not None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            user = User(
                email=email,
                hashed_password=hash_password(password),
                role=UserRole.admin,
                full_name=full_name,
                preferences={},
                subscription_tier="free",
            )
            db.add(user)
            action = "created"
        else:
            user.role = UserRole.admin
            user.hashed_password = hash_password(password)
            user.is_banned = False
            action = "updated"

        await db.commit()

    print(f"Admin user {action}:")
    print(f"  email:    {email}")
    print(f"  password: {password}")
    print("Use these at http://localhost:5174/login (API must be running on VITE_API_URL).")


if __name__ == "__main__":
    asyncio.run(main())
