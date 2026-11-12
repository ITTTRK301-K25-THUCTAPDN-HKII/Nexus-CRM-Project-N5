"""Materialize recurring appointment occurrences for the next 30 days."""

from datetime import datetime, timedelta

from app import APPOINTMENT_TIMEZONE, next_appointment_start, transaction


def run_appointment_scheduler(now=None, horizon_days=30):
    if isinstance(horizon_days, bool) or not isinstance(horizon_days, int) or horizon_days < 1:
        raise ValueError("horizon_days must be a positive integer.")
    if now is None:
        now = datetime.now(APPOINTMENT_TIMEZONE).replace(tzinfo=None)
    elif now.tzinfo:
        now = now.astimezone(APPOINTMENT_TIMEZONE).replace(tzinfo=None)
    horizon = now + timedelta(days=horizon_days)

    def materialize(cursor):
        cursor.execute(
            "SELECT id,organizer_user_id,lead_id,account_id,contact_id,deal_id,title,description,location,"
            "starts_at,ends_at,recurrence_frequency,recurrence_until,next_starts_at "
            "FROM appointment_series WHERE is_active=TRUE "
            "AND (next_starts_at<=%s OR recurrence_until<%s) FOR UPDATE",
            (horizon, now.date()),
        )
        series_rows = cursor.fetchall()
        created = 0
        for series in series_rows:
            next_start = series["next_starts_at"]
            duration = series["ends_at"] - series["starts_at"]
            while next_start <= horizon:
                if series["recurrence_until"] and next_start.date() > series["recurrence_until"]:
                    break
                cursor.execute(
                    "INSERT INTO appointments "
                    "(organizer_user_id,recurrence_series_id,lead_id,account_id,contact_id,deal_id,"
                    "title,description,location,starts_at,ends_at,status) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'SCHEDULED')",
                    (
                        series["organizer_user_id"], series["id"], series["lead_id"],
                        series["account_id"], series["contact_id"], series["deal_id"],
                        series["title"], series["description"], series["location"],
                        next_start, next_start + duration,
                    ),
                )
                created += 1
                next_start = next_appointment_start(
                    next_start, series["recurrence_frequency"], series["starts_at"].day,
                )

            active = not series["recurrence_until"] or next_start.date() <= series["recurrence_until"]
            cursor.execute(
                "UPDATE appointment_series SET next_starts_at=%s,is_active=%s WHERE id=%s",
                (next_start, active, series["id"]),
            )
        return created

    return transaction(materialize)


if __name__ == "__main__":
    count = run_appointment_scheduler()
    print(f"Đã tạo {count} lịch hẹn định kỳ cho 30 ngày tiếp theo.")
