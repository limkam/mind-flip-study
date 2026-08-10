"""Reprice legacy AI usage with model-specific rates.

Revision ID: f8g9h0i1j2k3
Revises: e7f8g9h0i1j2
"""

from alembic import op

revision = "f8g9h0i1j2k3"
down_revision = "e7f8g9h0i1j2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy schema combined cache reads/writes. Its calculator treated the field
    # as cache reads, so preserve that interpretation while correcting model rates
    # and the prior double-subtraction from uncached input.
    op.execute("UPDATE token_usage SET cache_read_tokens = cached_tokens WHERE cached_tokens > 0 AND cache_read_tokens = 0 AND cache_creation_tokens = 0")
    op.execute("""
        UPDATE token_usage
        SET estimated_cost_usd = CASE
            WHEN model LIKE 'claude-haiku-4-5%' THEN
                (input_tokens * 1.0 + output_tokens * 5.0 + cache_read_tokens * 0.10 + cache_creation_tokens * 1.25) / 1000000.0
            WHEN model LIKE 'claude-sonnet-4%' THEN
                (input_tokens * 3.0 + output_tokens * 15.0 + cache_read_tokens * 0.30 + cache_creation_tokens * 3.75) / 1000000.0
            ELSE estimated_cost_usd
        END
        WHERE status = 'succeeded'
    """)


def downgrade() -> None:
    # Historical overwritten estimates cannot be reconstructed exactly.
    pass
