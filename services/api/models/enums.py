"""PostgreSQL-backed string enums."""

from enum import StrEnum


class UserRole(StrEnum):
    admin = "admin"
    student = "student"


class BookStatus(StrEnum):
    processing = "processing"
    ready = "ready"
    error = "error"


class QuizChallengeStatus(StrEnum):
    pending = "pending"
    active = "active"
    completed = "completed"
    expired = "expired"


class WorkbookStatus(StrEnum):
    generating = "generating"
    ready = "ready"
    error = "error"


class AssignmentStatus(StrEnum):
    pending = "pending"
    processed = "processed"
    completed = "completed"


class FeedbackStatus(StrEnum):
    pending = "pending"
    reviewed = "reviewed"
    resolved = "resolved"
