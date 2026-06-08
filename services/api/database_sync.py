"""Sync SQLAlchemy session factory for Celery workers (asyncpg → psycopg)."""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from config import settings

_engine = None
SessionLocal: sessionmaker[Session] | None = None


def _sync_database_url(url: str) -> str:
    if "+asyncpg" in url:
        return url.replace("+asyncpg", "+psycopg", 1)
    if url.startswith("postgresql://") and "+psycopg" not in url and "+asyncpg" not in url:
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url


def init_sync_engine() -> None:
    global _engine, SessionLocal
    if _engine is None:
        _engine = create_engine(_sync_database_url(settings.DATABASE_URL), pool_pre_ping=True)
        SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False, expire_on_commit=False)


@contextmanager
def sync_session() -> Generator[Session, None, None]:
    init_sync_engine()
    assert SessionLocal is not None
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
