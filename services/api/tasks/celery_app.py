# # IMPORTANT: Run the Celery worker before uploading books or sending background emails.
# # Command: celery -A tasks.celery_app worker --loglevel=info

# from celery import Celery
# from celery.schedules import crontab

# from config import settings

# celery = Celery(
#     "mindflip",
#     broker=settings.REDIS_URL,
#     backend=settings.REDIS_URL,
# )
# celery.conf.task_serializer = "json"
# celery.conf.result_expires = 3600

# celery.conf.beat_schedule = {
#     "refresh-leaderboard": {
#         "task": "tasks.leaderboard_tasks.refresh_leaderboard_task",
#         "schedule": 300.0,
#     },
#     "send-streak-reminders": {
#         "task": "tasks.notification_tasks.send_streak_reminders",
#         "schedule": crontab(hour=20, minute=0),
#     },
#     "send-weekly-digests": {
#         "task": "tasks.email_tasks.send_weekly_digests_task",
#         "schedule": crontab(hour=9, minute=0, day_of_week=1),
#     },
# }

# # Register task modules (import side effects bind tasks to ``celery``).
# import tasks.ai_tasks  # noqa: E402, F401
# import tasks.email_tasks  # noqa: E402, F401
# import tasks.leaderboard_tasks  # noqa: E402, F401
# import tasks.notification_tasks  # noqa: E402, F401

# IMPORTANT: Run the Celery worker before uploading books or sending background emails.
# Command: celery -A tasks.celery_app worker --loglevel=info

from celery import Celery
from celery.schedules import crontab
import ssl  # ✅ ADDED for Upstash / rediss:// support

from config import settings

celery = Celery(
    "mindflip",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

# ✅ FIX: Required for rediss:// (Upstash Redis TLS)
if settings.REDIS_URL.startswith("rediss://"):
    celery.conf.broker_use_ssl = {"ssl_cert_reqs": ssl.CERT_NONE}
    celery.conf.redis_backend_use_ssl = {"ssl_cert_reqs": ssl.CERT_NONE}

celery.conf.task_serializer = "json"
celery.conf.result_expires = 3600
celery.conf.worker_prefetch_multiplier = 1

PHASE3_BEAT_SCHEDULE = {
    "award-monthly-allowances": {
        "task": "tasks.refill_tasks.award_monthly_allowances",
        "schedule": crontab(hour=0, minute=0, day_of_month=1),
    },
    "reconcile-stripe-billing": {
        "task": "tasks.billing_tasks.reconcile_stripe_billing",
        "schedule": 900.0,
    },
    "refresh-leaderboard": {
        "task": "tasks.leaderboard_tasks.refresh_leaderboard_task",
        "schedule": 300.0,
    },
    "engagement-due-email": {
        "task": "tasks.automation_tasks.process_due_email_automation",
        "schedule": float(settings.EMAIL_PROCESSOR_INTERVAL_SECONDS),
    },
    "engagement-weekly-summary-scan": {
        "task": "tasks.automation_tasks.scan_weekly_summary_candidates",
        "schedule": float(settings.WEEKLY_SUMMARY_SCAN_INTERVAL_MINUTES * 60),
    },
    "engagement-inactivity-scan": {
        "task": "tasks.automation_tasks.scan_inactivity_candidates",
        "schedule": float(settings.INACTIVITY_SCAN_INTERVAL_MINUTES * 60),
    },
    "engagement-streak-risk-scan": {
        "task": "tasks.automation_tasks.scan_streak_risk_candidates",
        "schedule": float(settings.STREAK_RISK_SCAN_INTERVAL_MINUTES * 60),
    },
    "engagement-cleanup": {
        "task": "tasks.automation_tasks.cleanup_engagement_automation",
        "schedule": float(settings.ENGAGEMENT_CLEANUP_INTERVAL_HOURS * 3600),
    },
}
celery.conf.beat_schedule = PHASE3_BEAT_SCHEDULE

# Register task modules (import side effects bind tasks to ``celery``).
import tasks.book_tasks  # noqa: E402, F401
import tasks.ai_tasks  # noqa: E402, F401
import tasks.email_tasks  # noqa: E402, F401
import tasks.leaderboard_tasks  # noqa: E402, F401
import tasks.notification_tasks  # noqa: E402, F401
import tasks.refill_tasks  # noqa: E402, F401
import tasks.automation_tasks  # noqa: E402, F401
import tasks.billing_tasks  # noqa: E402, F401
