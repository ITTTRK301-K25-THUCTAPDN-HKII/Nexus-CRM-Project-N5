import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as api


class FlaskAppTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()
        with api._rate_lock:
            api._rate_events.clear()

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


if __name__ == "__main__":
    unittest.main()
