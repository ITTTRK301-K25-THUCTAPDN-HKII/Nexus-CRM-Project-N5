import sys
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as api


class FlaskAppTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()
        with api._rate_lock:
            api._rate_events.clear()

    def authenticated_client(self, role="Sale", user_id=8):
        user = {
            "id": user_id,
            "name": f"Test {role}",
            "email": f"{role.lower()}@test.local",
            "role": role,
            "status": "ACTIVE",
        }
        token = api.jwt.encode(
            {
                "sub": str(user_id),
                "role": role,
                "iss": "nexus-crm",
                "aud": "nexus-web",
                "iat": datetime.now(timezone.utc),
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            },
            api.JWT_SECRET,
            algorithm="HS256",
        )
        self.client.set_cookie("nexus_access", token)
        return user

    def test_static_app_and_health_endpoints(self):
        for path in ("/", "/login", "/forgot-password", "/customers"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertIn(b"Nexus CRM", response.data)
        health = self.client.get("/api/health")
        self.assertEqual(health.json, {"status": "ok"})
        self.assertEqual(health.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(self.client.get("/api/missing").status_code, 404)

    def test_login_issues_http_only_scoped_cookies_and_authenticates(self):
        password = "Password123!"
        user = {
            "id": 7,
            "name": "Test Admin",
            "email": "admin@test.local",
            "role": "Admin",
            "status": "ACTIVE",
            "password_hash": api.password_hash(password),
        }
        with patch.object(api, "query", return_value=[user]), patch.object(
            api, "execute", return_value=(1, 1)
        ):
            login = self.client.post(
                "/api/auth/login",
                json={"email": user["email"], "password": password},
            )
            self.assertEqual(login.status_code, 200)
            cookies = login.headers.getlist("Set-Cookie")
            self.assertTrue(any("nexus_access=" in cookie and "HttpOnly" in cookie and "Path=/api" in cookie for cookie in cookies))
            self.assertTrue(any("nexus_refresh=" in cookie and "HttpOnly" in cookie and "Path=/api/auth" in cookie for cookie in cookies))
            with patch.object(api, "query", return_value=[user]):
                current = self.client.get("/api/auth/me")
            self.assertEqual(current.status_code, 200)
            self.assertEqual(current.json["user"]["role"], "Admin")

    def test_admin_role_is_enforced_and_failed_login_is_limited(self):
        user = {
            "id": 8,
            "name": "Test Sale",
            "email": "sale@test.local",
            "role": "Sale",
            "status": "ACTIVE",
            "password_hash": api.password_hash("Password123!"),
        }
        with patch.object(api, "query", return_value=[user]), patch.object(
            api, "execute", return_value=(1, 1)
        ):
            login = self.client.post(
                "/api/auth/login",
                json={"email": user["email"], "password": "Password123!"},
            )
            self.assertEqual(login.status_code, 200)
            with patch.object(api, "query", return_value=[user]):
                denied = self.client.get("/api/admin/users")
            self.assertEqual(denied.status_code, 403)

        with patch.object(api, "query", return_value=[]):
            for attempt in range(5):
                response = self.client.post(
                    "/api/auth/login",
                    json={"email": "wrong@test.local", "password": "WrongPassword"},
                )
                self.assertEqual(response.status_code, 401, f"attempt {attempt + 1}")
            limited = self.client.post(
                "/api/auth/login",
                json={"email": "wrong@test.local", "password": "WrongPassword"},
            )
        self.assertEqual(limited.status_code, 429)

    def test_deal_list_is_scoped_to_sales_owner_and_wide_for_manager(self):
        sale = self.authenticated_client("Sale", 8)
        with patch.object(api, "query", side_effect=[[sale], [], [{"total": 0}]]) as mocked_query:
            response = self.client.get("/api/deals")
        self.assertEqual(response.status_code, 200)
        self.assertIn("d.owner_user_id=%s", mocked_query.call_args_list[1].args[0])
        self.assertEqual(mocked_query.call_args_list[1].args[1], (sale["id"], 10, 0))

        manager = self.authenticated_client("Manager", 9)
        with patch.object(api, "query", side_effect=[[manager], [], [{"total": 0}]]) as mocked_query:
            response = self.client.get("/api/deals")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("owner_user_id=%s", mocked_query.call_args_list[1].args[0])

    def test_sales_cannot_read_other_users_deal_history(self):
        sale = self.authenticated_client("Sale", 8)
        with patch.object(api, "query", side_effect=[[sale], []]) as mocked_query:
            response = self.client.get("/api/deals/41/history")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(mocked_query.call_count, 2)
        self.assertEqual(mocked_query.call_args_list[1].args[1], (41, sale["id"]))

    def test_manager_can_read_deal_history_and_it_is_ordered_for_timeline(self):
        manager = self.authenticated_client("Manager", 9)
        history = [
            {"id": 1, "dealId": 41, "previousStage": None, "newStage": "PROSPECTING"},
            {"id": 2, "dealId": 41, "previousStage": "PROSPECTING", "newStage": "PROPOSAL"},
        ]
        with patch.object(api, "query", side_effect=[[manager], [{"id": 41}], history]) as mocked_query:
            response = self.client.get("/api/deals/41/history")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["history"], history)
        self.assertIn("ORDER BY h.changed_at ASC,h.id ASC", mocked_query.call_args_list[2].args[0])

    def test_deal_stage_update_writes_history_atomically(self):
        sale = self.authenticated_client("Sale", 8)

        class FakeCursor:
            def __init__(self):
                self.row = None
                self.statements = []

            def execute(self, sql, values=()):
                self.statements.append((sql, values))
                if "FROM deals WHERE id=%s AND owner_user_id=%s FOR UPDATE" in sql:
                    self.row = {
                        "id": 41,
                        "accountId": 10,
                        "contactId": None,
                        "ownerUserId": 8,
                        "name": "Example deal",
                        "amount": Decimal("125.00"),
                        "currency": "USD",
                        "stage": "PROSPECTING",
                        "probability": 10,
                        "expectedCloseDate": None,
                    }
                elif "FROM accounts WHERE id=%s AND owner_user_id=%s" in sql:
                    self.row = {"id": 10}

            def fetchone(self):
                return self.row

        cursor = FakeCursor()
        updated_deal = {"id": 41, "stage": "PROPOSAL", "amount": 125.0}
        with patch.object(api, "query", side_effect=[[sale], [updated_deal]]), patch.object(
            api, "transaction", side_effect=lambda work: work(cursor)
        ):
            response = self.client.patch(
                "/api/deals/41",
                json={"stage": "PROPOSAL", "probability": 60},
            )
        self.assertEqual(response.status_code, 200)
        history_writes = [statement for statement in cursor.statements if "INSERT INTO deal_history" in statement[0]]
        self.assertEqual(len(history_writes), 1)
        self.assertEqual(history_writes[0][1][2:4], ("PROSPECTING", "PROPOSAL"))

    def test_deal_payload_rejects_invalid_stage_and_amount(self):
        with self.assertRaises(ValueError):
            api.deal_payload({"name": "Deal", "accountId": 1, "stage": "UNKNOWN"})
        with self.assertRaises(ValueError):
            api.deal_payload({"name": "Deal", "accountId": 1, "amount": "-1"})


if __name__ == "__main__":
    unittest.main()
