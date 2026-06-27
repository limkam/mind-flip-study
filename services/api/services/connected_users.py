"""Users connected to the current user via challenges or study groups."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.quiz import QuizChallenge
from models.study_group import StudyGroupMember


async def connected_user_ids(db: AsyncSession, me: UUID) -> set[UUID]:
    """Challenge peers ∪ study-group co-members ∪ self."""
    ids: set[UUID] = {me}

    ch_r = await db.execute(
        select(QuizChallenge.challenger_id, QuizChallenge.challengee_id).where(
            or_(QuizChallenge.challenger_id == me, QuizChallenge.challengee_id == me),
        ),
    )
    for challenger_id, challengee_id in ch_r.all():
        if challenger_id != me:
            ids.add(challenger_id)
        if challengee_id != me:
            ids.add(challengee_id)

    sgm_me = StudyGroupMember.__table__.alias("sgm_me")
    sgm_other = StudyGroupMember.__table__.alias("sgm_other")
    grp_r = await db.execute(
        select(sgm_other.c.user_id)
        .select_from(sgm_me.join(sgm_other, sgm_me.c.group_id == sgm_other.c.group_id))
        .where(sgm_me.c.user_id == me, sgm_other.c.user_id != me),
    )
    ids.update(row[0] for row in grp_r.all())
    return ids
