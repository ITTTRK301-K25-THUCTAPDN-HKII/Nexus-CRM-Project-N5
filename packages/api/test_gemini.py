import json
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import app as api
import gemini_service


class GeminiServiceUnitTests(unittest.TestCase):
    def test_clean_json_markdown(self):
        raw = '{"status": "ok"}'
        self.assertEqual(gemini_service.clean_json_markdown(raw), '{"status": "ok"}')

        fenced = '```json\n{"status": "ok"}\n```'
        self.assertEqual(gemini_service.clean_json_markdown(fenced), '{"status": "ok"}')

        fenced_no_lang = '```\n{"status": "ok"}\n```'
        self.assertEqual(gemini_service.clean_json_markdown(fenced_no_lang), '{"status": "ok"}')

    def test_build_account_context(self):
        account = {
            "name": "Acme Corp",
            "industry": "Công nghệ thông tin",
            "website": "https://acme.local",
            "phone": "0987654321",
            "email": "contact@acme.local",
            "billingAddress": "Hà Nội",
            "ownerName": "Nguyễn Văn A",
            "createdAt": "2026-01-01",
        }
        contacts = [
            {"firstName": "Lê", "lastName": "Bình", "jobTitle": "CTO", "email": "binh@acme.local", "phone": "0912345678"}
        ]
        deals = [
            {"name": "Triển khai CRM", "amount": 50000.0, "currency": "USD", "stage": "PROPOSAL", "probability": 70, "expectedCloseDate": "2026-12-31"}
        ]
        activities = [
            {"type": "MEETING", "subject": "Họp demo sản phẩm", "details": "Khách hàng rất quan tâm tới tính năng AI", "occurredAt": "2026-11-15 10:00:00"}
        ]
        context = gemini_service.build_account_context(account, contacts, deals, activities)
        self.assertIn("Acme Corp", context)
        self.assertIn("Lê Bình", context)
        self.assertIn("Triển khai CRM", context)
        self.assertIn("Họp demo sản phẩm", context)

    def test_missing_api_key_raises_configuration_error(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            with self.assertRaises(gemini_service.GeminiConfigurationError):
                gemini_service.generate_account_copilot_brief(
                    account={"name": "Test"},
                    contacts=[],
                    deals=[],
                    activities=[],
                )

    @patch("gemini_service.genai.Client")
    def test_generate_account_copilot_brief_success(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client

        expected_result = {
            "relationship_health": {
                "status": "GOOD",
                "score": 85,
                "headline": "Mối quan hệ phát triển tích cực với 1 deal lớn đang mở.",
            },
            "executive_summary": "Khách hàng doanh nghiệp công nghệ tiềm năng cao.",
            "key_highlights": ["Đã hoàn thành demo thành công", "Cần chốt điều khoản bảo mật"],
            "risks": ["Cần phê duyệt từ ban giám đốc trước ngày 30"],
            "opportunities": ["Mở rộng thêm 50 user license cho chi nhánh miền Nam"],
            "recommended_actions": [
                {
                    "title": "Gửi báo giá cập nhật và tài liệu SLA",
                    "priority": "HIGH",
                    "due_days": 2,
                    "rationale": "Thúc đẩy tiến độ ký hợp đồng theo cam kết",
                }
            ],
            "email_draft": {
                "recipient_name": "Anh Bình",
                "subject": "Follow-up buổi demo giải pháp Nexus CRM",
                "body": "Chào anh Bình,\nCảm ơn anh đã tham gia buổi demo hôm qua...",
            },
        }

        mock_interaction = MagicMock()
        mock_interaction.output_text = json.dumps(expected_result)
        mock_client.interactions.create.return_value = mock_interaction

        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key-12345", "GEMINI_MODEL": "gemini-4-hydrogen"}):
            res = gemini_service.generate_account_copilot_brief(
                account={"name": "Acme Corp"},
                contacts=[],
                deals=[],
                activities=[],
            )
            self.assertEqual(res["relationship_health"]["score"], 85)
            self.assertEqual(res["model"], "gemini-4-hydrogen")
            self.assertEqual(len(res["recommended_actions"]), 1)


class GeminiApiEndpointTests(unittest.TestCase):
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

    def test_gemini_summary_requires_authentication(self):
        response = self.client.post("/api/customers/accounts/1/gemini-summary")
        self.assertEqual(response.status_code, 401)

    def test_gemini_summary_invalid_id(self):
        user = self.authenticated_client()
        with patch.object(api, "get_user", return_value=user):
            response = self.client.post("/api/customers/accounts/abc/gemini-summary")
            self.assertEqual(response.status_code, 400)

    @patch("app.can_access_customer", return_value=False)
    def test_gemini_summary_forbidden_account(self, mock_access):
        user = self.authenticated_client()
        with patch.object(api, "get_user", return_value=user):
            response = self.client.post("/api/customers/accounts/999/gemini-summary")
            self.assertEqual(response.status_code, 404)

    @patch("app.can_access_customer", return_value=True)
    @patch("app.query")
    def test_gemini_summary_missing_api_key_returns_400(self, mock_query, mock_access):
        user = self.authenticated_client()
        mock_query.side_effect = [
            [{"id": 1, "name": "Test Account", "industry": "IT", "website": None, "phone": None, "email": None, "billingAddress": None, "ownerUserId": 8, "ownerName": "Test Sale", "createdAt": "2026-01-01"}],
            [],  # contacts
            [],  # deals
            [],  # activities
        ]
        with patch.object(api, "get_user", return_value=user), patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            response = self.client.post("/api/customers/accounts/1/gemini-summary")
            self.assertEqual(response.status_code, 400)
            data = response.get_json()
            self.assertEqual(data.get("code"), "GEMINI_NOT_CONFIGURED")

    @patch("app.can_access_customer", return_value=True)
    @patch("app.query")
    @patch("app.generate_account_copilot_brief")
    def test_gemini_summary_success(self, mock_brief, mock_query, mock_access):
        user = self.authenticated_client()
        mock_query.side_effect = [
            [{"id": 1, "name": "Test Account", "industry": "IT", "website": None, "phone": None, "email": None, "billingAddress": None, "ownerUserId": 8, "ownerName": "Test Sale", "createdAt": "2026-01-01"}],
            [],  # contacts
            [],  # deals
            [],  # activities
        ]
        mock_brief.return_value = {
            "relationship_health": {"status": "GOOD", "score": 80, "headline": "Tốt"},
            "executive_summary": "Tóm tắt...",
            "key_highlights": ["Highlight 1"],
            "risks": [],
            "opportunities": [],
            "recommended_actions": [],
            "email_draft": {"recipient_name": "A", "subject": "B", "body": "C"},
        }

        with patch.object(api, "get_user", return_value=user):
            response = self.client.post("/api/customers/accounts/1/gemini-summary")
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            self.assertIn("summary", data)
            self.assertEqual(data["summary"]["relationship_health"]["score"], 80)


if __name__ == "__main__":
    unittest.main()
