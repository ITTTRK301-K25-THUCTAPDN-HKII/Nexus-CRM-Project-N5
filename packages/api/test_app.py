import sys
import unittest
from datetime import datetime, timedelta, timezone
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

    def test_deal_list_is_scoped_by_role(self):
        sale = self.authenticated_client("Sale", 8)
        with patch.object(api, "query", side_effect=[[sale], [], [{"total": 0}]]) as mocked_query:
            response = self.client.get("/api/deals")
        self.assertEqual(response.status_code, 200)
        self.assertIn("d.owner_user_id = %s", mocked_query.call_args_list[1].args[0])
        self.assertEqual(mocked_query.call_args_list[1].args[1], (sale["id"],))

        manager = self.authenticated_client("Manager", 9)
        with patch.object(api, "query", side_effect=[[manager], [], [{"total": 0}]]) as mocked_query:
            response = self.client.get("/api/deals")
        self.assertEqual(response.status_code, 200)
        self.assertIn("d.owner_user_id IN (SELECT id FROM users WHERE role='Sale')", mocked_query.call_args_list[1].args[0])
        self.assertEqual(mocked_query.call_args_list[1].args[1], ())

        admin = self.authenticated_client("Admin", 7)
        with patch.object(api, "query", side_effect=[[admin], []]) as mocked_query:
            response = self.client.get("/api/deals")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(" WHERE ", mocked_query.call_args_list[1].args[0])

    def test_deal_history_checks_access_and_returns_chronological_entries(self):
        manager = self.authenticated_client("Manager", 9)
        history = [
            {"id": 1, "dealId": 41, "previousStage": None, "newStage": "PROSPECTING"},
            {"id": 2, "dealId": 41, "previousStage": "PROSPECTING", "newStage": "PROPOSAL"},
        ]
        with patch.object(
            api, "query", side_effect=[[manager], [{"id": 41}], history]
        ) as mocked_query:
            response = self.client.get("/api/deals/41/history")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["history"], history)
        self.assertIn("ORDER BY h.changed_at ASC,h.id ASC", mocked_query.call_args_list[2].args[0])

        sale = self.authenticated_client("Sale", 8)
        with patch.object(api, "query", side_effect=[[sale], []]) as mocked_query:
            denied = self.client.get("/api/deals/41/history")
        self.assertEqual(denied.status_code, 404)
        self.assertEqual(mocked_query.call_args_list[1].args[1], (41, sale["id"]))

    def test_deal_detail_is_visible_only_inside_role_scope(self):
        manager = self.authenticated_client("Manager", 9)
        deal = {"id": 41, "name": "Team deal"}
        with patch.object(api, "query", side_effect=[[manager], [deal]]) as mocked_query:
            response = self.client.get("/api/deals/41")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["deal"], deal)
        self.assertIn("d.owner_user_id IN (SELECT id FROM users WHERE role='Sale')", mocked_query.call_args_list[1].args[0])

        sale = self.authenticated_client("Sale", 8)
        with patch.object(api, "query", side_effect=[[sale], []]) as mocked_query:
            denied = self.client.get("/api/deals/41")
        self.assertEqual(denied.status_code, 404)
        self.assertEqual(mocked_query.call_args_list[1].args[1], (41, sale["id"]))

    def test_sale_cannot_transfer_deal_and_stage_changes_use_dedicated_route(self):
        sale = self.authenticated_client("Sale", 8)
        with patch.object(api, "query", return_value=[sale]):
            transfer = self.client.patch(
                "/api/deals/41",
                json={"ownerUserId": 10, "expectedVersion": 1},
            )
        self.assertEqual(transfer.status_code, 403)

        with patch.object(api, "query", return_value=[sale]):
            stage_update = self.client.patch("/api/deals/41", json={"stage": "WON"})
        self.assertEqual(stage_update.status_code, 400)

    def test_manager_can_update_a_sale_deal_and_history_is_written(self):
        manager = self.authenticated_client("Manager", 9)

        class FakeCursor:
            def __init__(self):
                self.row = {
                    "id": 41,
                    "ownerUserId": 8,
                    "ownerRole": "Sale",
                    "stage": "PROSPECTING",
                    "amount": 100,
                    "version": 1,
                    "expectedCloseDate": None,
                }
                self.rowcount = 0
                self.statements = []

            def execute(self, statement, values):
                self.statements.append((statement, values))
                if statement.startswith("UPDATE deals"):
                    self.rowcount = 1

            def fetchone(self):
                return self.row

        cursor = FakeCursor()
        with patch.object(api, "query", return_value=[manager]), patch.object(
            api, "transaction", side_effect=lambda work: work(cursor)
        ):
            response = self.client.patch(
                "/api/deals/41/stage",
                json={
                    "stage": "PROPOSAL",
                    "expectedStage": "PROSPECTING",
                    "expectedVersion": 1,
                },
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["stage"], "PROPOSAL")
        self.assertIn("INNER JOIN users u ON u.id=d.owner_user_id", cursor.statements[0][0])
        self.assertTrue(any("INSERT INTO deal_history" in statement for statement, _ in cursor.statements))


if __name__ == "__main__":
    unittest.main()
