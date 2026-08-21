from collections.abc import AsyncGenerator
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
import time

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def split_database_url_for_asyncpg(database_url: str) -> tuple[str, dict]:
    """
    Build a URL + connect_args for SQLAlchemy asyncpg.

    asyncpg does not accept libpq query params like ``sslmode`` / ``channel_binding``;
    Neon and other hosts often append them — strip and map ``sslmode=require`` (etc.) to
    ``connect_args={"ssl": True}``.
    """
    raw = database_url.strip()
    if not raw.startswith(("postgresql://", "postgresql+asyncpg://")):
        return raw, {}

    if raw.startswith("postgresql+asyncpg://"):
        libpq_style = raw.replace("postgresql+asyncpg://", "postgresql://", 1)
    else:
        libpq_style = raw

    parsed = urlparse(libpq_style)
    pairs = parse_qsl(parsed.query, keep_blank_values=True)
    qdict: dict[str, list[str]] = {}
    for k, v in pairs:
        qdict.setdefault(k, []).append(v)

    ssl_modes = [x.lower() for x in qdict.pop("sslmode", [])]
    qdict.pop("channel_binding", None)

    want_ssl = False
    for mode in ssl_modes:
        if mode in ("require", "verify-ca", "verify-full", "prefer", "allow", "true", "1"):
            want_ssl = True
        if mode in ("disable", "false", "0"):
            want_ssl = False

    flat: list[tuple[str, str]] = []
    for key, vals in qdict.items():
        for val in vals:
            flat.append((key, val))
    new_query = urlencode(flat)
    cleaned = urlunparse(parsed._replace(query=new_query))
    async_url = cleaned.replace("postgresql://", "postgresql+asyncpg://", 1)

    connect_args: dict = {}
    if want_ssl:
        connect_args["ssl"] = True

    return async_url, connect_args


def _async_database_url(url: str) -> str:
    """Return asyncpg URL string only (legacy); prefer :func:`split_database_url_for_asyncpg`."""
    u, _ = split_database_url_for_asyncpg(url)
    return u


def create_engine(database_url: str):
    url, connect_args = split_database_url_for_asyncpg(database_url)
    # Hosted Postgres providers can close idle TCP connections while they are
    # still held by SQLAlchemy's pool.  Verify a connection before handing it
    # to a request so the pool transparently replaces a stale one instead of
    # returning a 500 for an otherwise valid API call.
    return create_async_engine(
        url,
        echo=False,
        connect_args=connect_args,
        pool_pre_ping=True,
    )


engine = None
AsyncSessionLocal: async_sessionmaker[AsyncSession] | None = None


def init_engine(database_url: str):
    global engine, AsyncSessionLocal
    engine = create_engine(database_url)
    # SQLAlchemy events attach to the synchronous engine underlying AsyncEngine.
    # Aggregate timings are associated with the current request via a ContextVar.
    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault("bilkeys_query_started", []).append(time.perf_counter())

    @event.listens_for(engine.sync_engine, "after_cursor_execute")
    def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        starts = conn.info.get("bilkeys_query_started") or []
        if not starts:
            return
        from middleware.performance_timing import record_sql

        record_sql((time.perf_counter() - starts.pop()) * 1000)
    AsyncSessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    if AsyncSessionLocal is None:
        raise RuntimeError("Database not initialized; call init_engine first")
    async with AsyncSessionLocal() as session:
        yield session
