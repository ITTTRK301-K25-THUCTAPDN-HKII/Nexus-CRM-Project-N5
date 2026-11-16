import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as api


class QuoteApiTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()

    def user(self, role="Sale", user_id=8):
        return {
            "id": user_id,
            "name": f"Test {role}",
            "email": f"{role.lower()}@test.local",
            "role": role,
            "status": "ACTIVE",
        }

    def authenticate(self, role="Sale", user_id=8):
        user = self.user(role, user_id)
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

    def quote(self, **overrides):
        row = {
            "id": 21,
            "quoteNumber": "Q-2026-0021",
            "dealId": 4,
            "dealName": "CRM rollout",
            "ownerUserId": 8,
            "accountId": 6,
            "accountName": "Acme",
            "accountEmail": "buyer@example.test",
            "accountPhone": "+84123456789",
            "accountAddress": "Ha Noi",
            "createdByUserId": 8,
            "createdByName": "Test Sale",
            "status": "DRAFT",
            "approvalStatus": "NOT_REQUESTED",
            "approvalRequestedAt": None,
            "approvalDecidedAt": None,
            "approvalDecidedByUserId": None,
            "approvalDecidedByName": None,
            "approvalNote": None,
            "currency": "USD",
            "validUntil": "2026-12-31",
            "subtotal": "100.00",
            "taxAmount": "10.00",
            "totalAmount": "110.00",
            "createdAt": "2026-11-16 10:00:00",
            "updatedAt": "2026-11-16 10:00:00",
        }
        row.update(overrides)
        return row

    def detail_queries(self, quote=None):
        return [quote or self.quote()], [{
            "id": 31,
            "productId": 9,
            "sku": "SVC-1",
            "description": "CRM implementation",
            "quantity": "2.000",
            "unitPrice": "50.00",
            "discountPercent": "0.00",
            "lineTotal": "100.00",
        }], []

    def test_quote_list_is_scoped_and_can_filter_approval_status(self):
        sale = self.authenticate()
        with patch.object(api, "get_user", return_value=sale), patch.object(
            api, "query", side_effect=[[self.quote()], [{"total": 1}]]
        ) as query:
            response = self.client.get("/api/quotes?approvalStatus=PENDING&pageSize=10")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["total"], 1)
        self.assertIn("d.owner_user_id = %s", query.call_args_list[0].args[0])
        self.assertEqual(query.call_args_list[0].args[1], (sale["id"], "PENDING", 10, 0))

    def test_sale_can_request_approval_for_draft_quote(self):
        sale = self.authenticate()

        class FakeCursor:
            def __init__(self):
                self.statements = []

            def execute(self, statement, values):
                self.statements.append((statement, values))

            def fetchone(self):
                return {
                    "id": 21, "status": "DRAFT", "approval_status": "NOT_REQUESTED",
                    "valid_until": None, "owner_user_id": 8,
                }

        cursor = FakeCursor()
        with patch.object(api, "get_user", return_value=sale), patch.object(
            api, "transaction", side_effect=lambda work: work(cursor)
        ), patch.object(api, "query", side_effect=self.detail_queries(self.quote(approvalStatus="PENDING"))):
            response = self.client.post("/api/quotes/21/approval-request", json={"note": "Ready for review"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["quote"]["approvalStatus"], "PENDING")
        self.assertTrue(any("APPROVAL_REQUESTED" in statement for statement, _ in cursor.statements))

    def test_only_manager_or_admin_can_decide_and_rejection_requires_note(self):
        sale = self.authenticate()
        with patch.object(api, "get_user", return_value=sale):
            denied = self.client.post("/api/quotes/21/approval", json={"decision": "APPROVED"})
        self.assertEqual(denied.status_code, 403)

        manager = self.authenticate("Manager", 9)
        with patch.object(api, "get_user", return_value=manager):
            invalid = self.client.post("/api/quotes/21/approval", json={"decision": "REJECTED"})
        self.assertEqual(invalid.status_code, 400)

    def test_manager_can_approve_pending_quote_and_history_is_written(self):
        manager = self.authenticate("Manager", 9)

        class FakeCursor:
            def __init__(self):
                self.statements = []

            def execute(self, statement, values):
                self.statements.append((statement, values))

            def fetchone(self):
                return {
                    "id": 21, "status": "DRAFT", "approval_status": "PENDING",
                    "valid_until": None, "owner_user_id": 8,
                }

        cursor = FakeCursor()
        approved = self.quote(approvalStatus="APPROVED", approvalDecidedByUserId=9)
        with patch.object(api, "get_user", return_value=manager), patch.object(
            api, "transaction", side_effect=lambda work: work(cursor)
        ), patch.object(api, "query", side_effect=self.detail_queries(approved)):
            response = self.client.post("/api/quotes/21/approval", json={"decision": "APPROVED"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["quote"]["approvalStatus"], "APPROVED")
        self.assertTrue(any("approval_decided_by_user_id" in statement for statement, _ in cursor.statements))
        self.assertTrue(any(
            "APPROVED" in values
            for statement, values in cursor.statements
            if statement.startswith("INSERT INTO quote_history")
        ))

    def test_quote_cannot_be_sent_before_approval(self):
        sale = self.authenticate()

        class FakeCursor:
            def execute(self, _statement, _values):
                pass

            def fetchone(self):
                return {
                    "id": 21, "status": "DRAFT", "approval_status": "PENDING",
                    "valid_until": None, "owner_user_id": 8,
                }

        cursor = FakeCursor()
        with patch.object(api, "get_user", return_value=sale), patch.object(
            api, "transaction", side_effect=lambda work: work(cursor)
        ):
            response = self.client.patch("/api/quotes/21/status", json={"status": "SENT"})
        self.assertEqual(response.status_code, 409)
        self.assertIn("duyệt", response.json["message"])

    def test_approved_quote_can_be_sent_and_status_change_is_logged(self):
        sale = self.authenticate()

        class FakeCursor:
            def __init__(self):
                self.statements = []

            def execute(self, statement, values):
                self.statements.append((statement, values))

            def fetchone(self):
                return {
                    "id": 21, "status": "DRAFT", "approval_status": "APPROVED",
                    "valid_until": None, "owner_user_id": 8,
                }

        cursor = FakeCursor()
        sent = self.quote(status="SENT", approvalStatus="APPROVED")
        with patch.object(api, "get_user", return_value=sale), patch.object(
            api, "transaction", side_effect=lambda work: work(cursor)
        ), patch.object(api, "query", side_effect=self.detail_queries(sent)):
            response = self.client.patch("/api/quotes/21/status", json={"status": "SENT"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["quote"]["status"], "SENT")
        self.assertTrue(any(
            statement.startswith("INSERT INTO quote_history") and values[2] == "DRAFT" and values[3] == "SENT"
            for statement, values in cursor.statements
        ))

    def test_quote_pdf_returns_downloadable_pdf_for_accessible_quote(self):
        sale = self.authenticate()
        with patch.object(api, "get_user", return_value=sale), patch.object(
            api, "query", side_effect=self.detail_queries()
        ):
            response = self.client.get("/api/quotes/21/pdf")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/pdf")
        self.assertIn("attachment; filename=\"quote-21.pdf\"", response.headers["Content-Disposition"])
        self.assertTrue(response.data.startswith(b"%PDF-"))

    def test_quote_pdf_does_not_disclose_out_of_scope_quote(self):
        sale = self.authenticate()
        with patch.object(api, "get_user", return_value=sale), patch.object(api, "query", return_value=[]):
            response = self.client.get("/api/quotes/21/pdf")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
