"""Which FlashcardSet rows a user may study/track progress on.

Historically every study/progress query filtered `FlashcardSet.user_id == current_user.id`
— a user could only ever study content they owned. Study Groups activation
(models/study_group.py:StudyGroupContentActivation) adds a second path: a set the user
doesn't own but has activated (spending their own quota on it, see
Action.ACTIVATE_SHARED_CONTENT in services/entitlements.py). This helper is the single place
that combines both, so read/study endpoints stay correct without duplicating the union
everywhere.

Only for reads. Content mutation (create/edit/delete/regenerate) must stay strictly
ownership-scoped — do not use this helper there.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.sql.selectable import ScalarSelect

from models.flashcard import FlashcardSet
from models.study_group import StudyGroupContentActivation


def accessible_set_ids_subquery(user_id: UUID) -> ScalarSelect:
    """Scalar subquery of FlashcardSet.id the user may study: owned or actively activated."""
    owned = select(FlashcardSet.id).where(FlashcardSet.user_id == user_id)
    activated = select(StudyGroupContentActivation.set_id).where(
        StudyGroupContentActivation.user_id == user_id,
        StudyGroupContentActivation.deactivated_at.is_(None),
    )
    return owned.union(activated).scalar_subquery()
