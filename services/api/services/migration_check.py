"""Startup guard against alembic revision drift between the connected database and the
code's migration head.

Silent drift here — a schema the running code expects that was never actually applied to
the connected database — is how this class of incident keeps recurring, caught only by
manual live testing instead of failing loudly at boot. See main.py's lifespan for how this
is wired in: enforced (raises) only when ENVIRONMENT=="production", so local/dev/test runs
(including pytest, which never connects to a real database at all) are never blocked.
"""

from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

_ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


class MigrationDriftError(RuntimeError):
    """The connected database's alembic revision doesn't match the code's migration head."""


def code_migration_heads() -> set[str]:
    cfg = Config(str(_ALEMBIC_INI))
    script = ScriptDirectory.from_config(cfg)
    return set(script.get_heads())


async def check_migration_head(engine: AsyncEngine) -> None:
    """Raise MigrationDriftError if the DB's alembic_version doesn't match the code's head(s)."""
    heads = code_migration_heads()
    async with engine.connect() as conn:
        try:
            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            db_versions = {row[0] for row in result}
        except Exception as exc:
            raise MigrationDriftError(
                "Could not read alembic_version from the database "
                f"({type(exc).__name__}: {exc}). Has `alembic upgrade head` been run "
                "against this database?"
            ) from exc
    if db_versions != heads:
        raise MigrationDriftError(
            f"Database alembic revision {sorted(db_versions) or '(none)'} does not match "
            f"code migration head {sorted(heads)}. Run `alembic upgrade head` against this "
            "database before serving traffic."
        )
