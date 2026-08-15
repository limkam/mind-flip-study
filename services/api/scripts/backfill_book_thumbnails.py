#!/usr/bin/env python3
"""Queue first-page thumbnails for books created before thumbnail support."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from config import settings
from database import init_engine
from models.book import Book
from tasks.book_tasks import generate_book_thumbnail_task


async def main() -> None:
    init_engine(settings.DATABASE_URL)
    from database import AsyncSessionLocal

    assert AsyncSessionLocal is not None
    async with AsyncSessionLocal() as db:
        books = (await db.scalars(select(Book))).all()
        pending = []
        for book in books:
            extras = dict(book.extras or {})
            if (extras.get("thumbnail") or {}).get("status") in {"ready", "processing"}:
                continue
            extras["thumbnail"] = {"status": "processing"}
            book.extras = extras
            pending.append(str(book.id))
        await db.commit()

    for book_id in pending:
        generate_book_thumbnail_task.delay(book_id)
    print(f"Queued {len(pending)} book thumbnail(s)")


if __name__ == "__main__":
    asyncio.run(main())
