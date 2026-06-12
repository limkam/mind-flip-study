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
    celery.conf.broker_use_ssl = {
        "ssl_cert_reqs": ssl.CERT_NONE
    }
    celery.conf.redis_backend_use_ssl = {
        "ssl_cert_reqs": ssl.CERT_NONE
    }

celery.conf.task_serializer = "json"
celery.conf.result_expires = 3600

celery.conf.beat_schedule = {
    "refresh-leaderboard": {
        "task": "tasks.leaderboard_tasks.refresh_leaderboard_task",
        "schedule": 300.0,
    },
    "send-streak-reminders": {
        "task": "tasks.notification_tasks.send_streak_reminders",
        "schedule": crontab(hour=20, minute=0),
    },
    "send-weekly-digests": {
        "task": "tasks.email_tasks.send_weekly_digests_task",
        "schedule": crontab(hour=9, minute=0, day_of_week=1),
    },
}

# Register task modules (import side effects bind tasks to ``celery``).
import tasks.book_tasks  # noqa: E402, F401
import tasks.ai_tasks  # noqa: E402, F401
import tasks.email_tasks  # noqa: E402, F401
import tasks.leaderboard_tasks  # noqa: E402, F401
import tasks.notification_tasks  # noqa: E402, F401
