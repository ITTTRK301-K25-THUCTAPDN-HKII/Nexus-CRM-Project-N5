import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as api
import appointment_scheduler


class AppointmentTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()

    def authenticated_client(self, role="Sale", user_id=8):
        user = {
            "id": user_id,
            "name": f"Test {role}",
            "email": f"{role.lower()}@test.local",
            "role": role,
            "status": "ACTIVE",
        }
        now = datetime.now(timezone.utc)
        token = api.jwt.encode(
            {
                "sub": str(user_id),
                "role": role,
                "iss": "nexus-crm",
                "aud": "nexus-web",
                "iat": now,
                "exp": now + timedelta(minutes=5),
            },
            api.JWT_SECRET,
            algorithm="HS256",
        )
        self.client.set_cookie("nexus_access", token)
        return user

    def test_appointment_payload_validates_time_and_recurrence(self):
        valid = api.appointment_payload({
            "title": "Weekly customer call",
            "startsAt": "2026-11-13T10:00:00+07:00",
            "endsAt": "2026-11-13T10:30:00+07:00",
            "recurrenceFrequency": "WEEKLY",
            "recurrenceUntil": "2026-12-31",
        })
        self.assertEqual(valid["startsAt"], datetime(2026, 11, 13, 10))
        self.assertEqual(valid["recurrenceUntil"], date(2026, 12, 31))
        with self.assertRaises(ValueError):
            api.appointment_payload({
                "title": "Invalid appointment",
                "startsAt": "2026-11-13T10:30:00",
                "endsAt": "2026-11-13T10:00:00",
            })
        with self.assertRaises(ValueError):
            api.appointment_payload({
                "title": "Invalid recurrence",
                "startsAt": "2026-11-13T10:00:00",
                "endsAt": "2026-11-13T10:30:00",
                "recurrenceFrequency": "DAILY",
            })

    def test_sale_appointment_list_is_scoped_and_filtered(self):
        sale = self.authenticated_client("Sale", 8)
        items = [{"id": 13, "title": "Customer meeting"}]
        with patch.object(api, "query", side_effect=[[sale], items, [{"total": 1}]]) as mocked_query:
            response = self.client.get(
                "/api/appointments?status=SCHEDULED&from=2026-11-12&to=2026-11-20",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["appointments"], items)
        self.assertEqual(response.json["total"], 1)
        self.assertIn("a.organizer_user_id=%s", mocked_query.call_args_list[1].args[0])
        self.assertIn("a.starts_at >= %s", mocked_query.call_args_list[1].args[0])
        self.assertIn("a.starts_at < %s", mocked_query.call_args_list[1].args[0])
        self.assertEqual(mocked_query.call_args_list[1].args[1][3], date(2026, 11, 21))

    def test_create_recurring_appointment_persists_series_and_first_occurrence(self):
        self.authenticated_client("Sale", 8)

        class FakeCursor:
            def __init__(self):
                self.statements = []
                self.lastrowid = 41

            def execute(self, statement, values):
                self.statements.append((statement, values))
                if "INSERT INTO appointment_series" in statement:
                    self.lastrowid = 15
                elif "INSERT INTO appointments" in statement:
                    self.lastrowid = 41

            def fetchone(self):
                raise AssertionError("No customer relation should be queried.")

        cursor = FakeCursor()
        appointment = {"id": 41, "title": "Weekly call", "recurrenceFrequency": "WEEKLY"}
        sale_user = {
            "id": 8, "name": "Test Sale", "email": "sale@test.local",
            "role": "Sale", "status": "ACTIVE",
        }
        with patch.object(api, "transaction", side_effect=lambda work: work(cursor)), patch.object(
            api, "query", side_effect=[[sale_user], [appointment]],
        ) as mocked_query:
            response = self.client.post(
                "/api/appointments",
                json={
                    "title": "Weekly call",
                    "startsAt": "2026-11-13T10:00:00",
                    "endsAt": "2026-11-13T10:30:00",
                    "recurrenceFrequency": "WEEKLY",
                    "recurrenceUntil": "2026-12-31",
                },
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["recurrenceSeriesId"], 15)
        self.assertTrue(any("INSERT INTO appointment_series" in sql for sql, _ in cursor.statements))
        self.assertTrue(any("INSERT INTO appointments" in sql for sql, _ in cursor.statements))
        self.assertEqual(mocked_query.call_count, 2)

    def test_update_and_delete_appointment_respect_owner_scope(self):
        sale_user = self.authenticated_client("Sale", 8)

        class FakeCursor:
            def __init__(self):
                self.statements = []

            def execute(self, statement, values):
                self.statements.append((statement, values))

            def fetchone(self):
                return {
                    "id": 13,
                    "organizer_user_id": 8,
                    "lead_id": None,
                    "account_id": None,
                    "contact_id": None,
                    "deal_id": None,
                    "title": "Meeting",
                    "description": None,
                    "location": None,
                    "starts_at": datetime(2026, 11, 13, 10),
                    "ends_at": datetime(2026, 11, 13, 10, 30),
                    "status": "SCHEDULED",
                }

        cursor = FakeCursor()
        updated = {"id": 13, "title": "Updated meeting"}
        with patch.object(api, "transaction", side_effect=lambda work: work(cursor)), patch.object(
            api, "query", side_effect=[[sale_user], [updated]],
        ) as mocked_query:
            response = self.client.patch("/api/appointments/13", json={"title": "Updated meeting"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["appointment"], updated)
        self.assertIn("a.organizer_user_id=%s", cursor.statements[0][0])
        self.assertEqual(mocked_query.call_args_list[1].args[1], (13,))

        self.authenticated_client("Sale", 8)
        with patch.object(api, "query", return_value=[sale_user]), patch.object(
            api, "execute", return_value=(None, 1),
        ) as mocked_execute:
            deleted = self.client.delete("/api/appointments/13")
        self.assertEqual(deleted.status_code, 204)
        self.assertIn("organizer_user_id=%s", mocked_execute.call_args.args[0])

    def test_cancel_series_deactivates_recurrence_and_cancels_future_items(self):
        sale_user = self.authenticated_client("Sale", 8)

        class FakeCursor:
            def __init__(self):
                self.statements = []

            def execute(self, statement, values):
                self.statements.append((statement, values))

            def fetchone(self):
                return {"id": 15}

        cursor = FakeCursor()
        with patch.object(api, "transaction", side_effect=lambda work: work(cursor)), patch.object(
            api, "query", return_value=[sale_user],
        ):
            response = self.client.delete("/api/appointment-series/15")
        self.assertEqual(response.status_code, 204)
        self.assertIn("s.organizer_user_id=%s", cursor.statements[0][0])
        self.assertTrue(any("SET is_active=FALSE" in sql for sql, _ in cursor.statements))
        self.assertTrue(any("status='CANCELLED'" in sql for sql, _ in cursor.statements))

    def test_monthly_scheduler_preserves_anchor_day_and_stops_at_end_date(self):
        series = {
            "id": 7,
            "organizer_user_id": 8,
            "lead_id": None,
            "account_id": None,
            "contact_id": None,
            "deal_id": None,
            "title": "Monthly review",
            "description": None,
            "location": None,
            "starts_at": datetime(2026, 1, 31, 10),
            "ends_at": datetime(2026, 1, 31, 11),
            "recurrence_frequency": "MONTHLY",
            "recurrence_until": date(2026, 3, 31),
            "next_starts_at": datetime(2026, 2, 28, 10),
        }

        class FakeCursor:
            def __init__(self):
                self.statements = []

            def execute(self, statement, values):
                self.statements.append((statement, values))

            def fetchall(self):
                return [series]

        cursor = FakeCursor()
        with patch.object(appointment_scheduler, "transaction", side_effect=lambda work: work(cursor)):
            created = appointment_scheduler.run_appointment_scheduler(
                datetime(2026, 1, 31, 9), horizon_days=60,
            )
        inserts = [
            values for statement, values in cursor.statements
            if statement.startswith("INSERT INTO appointments")
        ]
        self.assertEqual(created, 2)
        self.assertEqual([values[9] for values in inserts], [
            datetime(2026, 2, 28, 10),
            datetime(2026, 3, 31, 10),
        ])
        self.assertTrue(any("UPDATE appointment_series" in sql for sql, _ in cursor.statements))


if __name__ == "__main__":
    unittest.main()
