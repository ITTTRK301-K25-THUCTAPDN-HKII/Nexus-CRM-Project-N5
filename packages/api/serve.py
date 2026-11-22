import os

from waitress import serve

from app import app, start_task_notification_scheduler


if __name__ == "__main__":
    start_task_notification_scheduler()
    serve(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "3001")),
        threads=int(os.getenv("WAITRESS_THREADS", "8")),
    )
