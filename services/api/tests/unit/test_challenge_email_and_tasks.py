from __future__ import annotations

import ast
from pathlib import Path

from emails.templates.challenge import challenge_alert_email


def test_challenge_email_expiry_copy_matches_actual_duration() -> None:
    """quiz_challenges.create_challenge sets expires_at = now + timedelta(days=7);
    the email copy must say the same thing it actually does."""
    html = challenge_alert_email("Casey", "Jordan", "Bio 101", 82, "abc123")

    assert "7 days" in html
    assert "48 hours" not in html


def test_send_challenge_alert_task_defined_exactly_once() -> None:
    """Regression guard: this task was previously defined twice under the same
    Celery task name, with the second definition silently shadowing the first."""
    tasks_path = Path(__file__).resolve().parents[2] / "tasks" / "email_tasks.py"
    tree = ast.parse(tasks_path.read_text())
    top_level_defs = [
        node.name
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "send_challenge_alert_task"
    ]
    assert len(top_level_defs) == 1
