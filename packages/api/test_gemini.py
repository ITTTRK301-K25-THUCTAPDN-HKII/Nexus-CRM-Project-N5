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
    @patch("gemini_service.genai.Client")
    def test_generate_text_sends_prompt_and_returns_string(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.models.generate_content.return_value.text = "  Xin chào  "
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "gemini-test"}):
            result = gemini_service.generate_text("Trả lời xin chào")
        self.assertEqual(result, "Xin chào")
        mock_client.models.generate_content.assert_called_once_with(
            model="gemini-test", contents="Trả lời xin chào"
        )

    @patch("gemini_service.genai.Client")
    def test_generate_json_requests_json_and_decodes_result(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.models.generate_content.return_value.text = '```json\n{"ok": true}\n```'
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "gemini-test"}):
            result = gemini_service.generate_json("Trả về JSON có trường ok")
        self.assertEqual(result, {"ok": True})
        self.assertEqual(
            mock_client.models.generate_content.call_args.kwargs["config"],
            {"response_mime_type": "application/json"},
        )

    def test_generate_helpers_reject_empty_prompt(self):
        with self.assertRaises(ValueError):
            gemini_service.generate_text("  ")
        with self.assertRaises(ValueError):
            gemini_service.generate_json("")

    @patch("gemini_service.genai.Client")
    def test_generate_account_copilot_explains_temporary_503(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.interactions.create.side_effect = RuntimeError(
            "Error code: 503 service_unavailable: currently experiencing high demand"
        )
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "gemini-4-hydrogen"}):
            with self.assertRaisesRegex(gemini_service.GeminiServiceError, "quá tải tạm thời.*503"):
                gemini_service.generate_account_copilot_brief({}, [], [], [])

    @patch("gemini_service.genai.Client")
    def test_generate_activity_summary_explains_temporary_503(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.interactions.create.side_effect = RuntimeError("503 service unavailable")
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "gemini-test"}):
            with self.assertRaisesRegex(gemini_service.GeminiServiceError, "quá tải tạm thời.*503"):
                gemini_service.generate_activity_smart_summary([])

    @patch("gemini_service.genai.Client")
    def test_generate_account_copilot_turns_timeout_into_clear_error(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.interactions.create.side_effect = TimeoutError("request timed out")
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "gemini-test"}):
            with self.assertRaisesRegex(gemini_service.GeminiServiceError, "tối đa 120 giây"):
                gemini_service.generate_account_copilot_brief({}, [], [], [])
        self.assertEqual(mock_client.interactions.create.call_args.kwargs["timeout"], 120)

    @patch("gemini_service.genai.Client")
    def test_generate_json_rejects_invalid_json(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.models.generate_content.return_value.text = "không phải JSON"
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with self.assertRaises(gemini_service.GeminiServiceError):
                gemini_service.generate_json("JSON please")

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

    def test_activity_summary_context_redacts_sensitive_values_without_hiding_dates(self):
        context = gemini_service.build_activity_summary_context(
            [{
                "type": "EMAIL",
                "subject": "Acme Corporation cần tư vấn",
                "details": "Liên hệ anh Nam tại nam@example.com hoặc 0912345678, mã hồ sơ 123456789. "
                           "Trang https://example.test/reset?token=secret123 password=hunter2",
                "occurredAt": "2026-11-18 10:30:00",
            }],
            ["Acme Corporation"],
        )
        self.assertNotIn("Acme Corporation", context)
        self.assertNotIn("nam@example.com", context)
        self.assertNotIn("0912345678", context)
        self.assertNotIn("123456789", context)
        self.assertNotIn("https://example.test", context)
        self.assertNotIn("hunter2", context)
        self.assertIn("[đã ẩn]", context)
        self.assertIn("2026-11-18 10:30:00", context)

    @patch("gemini_service.genai.Client")
    def test_generate_activity_smart_summary_returns_three_fields_and_sends_redacted_context(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_client.interactions.create.return_value.output_text = json.dumps({
            "needs": "Tích hợp báo cáo bán hàng.",
            "sentiment": "Tích cực; khách hàng chủ động hỏi về kế hoạch triển khai.",
            "next_step": "Gửi lịch demo tích hợp trong tuần này.",
        })
        activities = [{
            "type": "MEETING", "subject": "Acme Corporation hỏi về tích hợp",
            "details": "Gọi 0901234567 hoặc mail a@acme.test.", "occurredAt": "2026-11-18 10:30:00",
        }]
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "gemini-test"}):
            result = gemini_service.generate_activity_smart_summary(activities, ["Acme Corporation"])
        self.assertEqual(set(result), {"needs", "sentiment", "next_step", "model"})
        self.assertEqual(result["model"], "gemini-test")
        prompt = mock_client.interactions.create.call_args.kwargs["input"]
        self.assertNotIn("Acme Corporation", prompt)
        self.assertNotIn("0901234567", prompt)
        self.assertNotIn("a@acme.test", prompt)

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

    def test_ai_activity_summary_requires_authentication(self):
        response = self.client.post("/api/ai/summarize", json={"customerId": 1})
        self.assertEqual(response.status_code, 401)

    def test_ai_activity_summary_validates_customer_id(self):
        user = self.authenticated_client()
        with patch.object(api, "get_user", return_value=user):
            response = self.client.post("/api/ai/summarize", json={"customerId": "bad"})
        self.assertEqual(response.status_code, 400)

    @patch("app.can_access_customer", return_value=False)
    def test_ai_activity_summary_enforces_account_ownership(self, _mock_access):
        user = self.authenticated_client()
        with patch.object(api, "get_user", return_value=user):
            response = self.client.post("/api/ai/summarize", json={"customerId": 44})
        self.assertEqual(response.status_code, 404)

    @patch("app.can_access_customer", return_value=True)
    @patch("app.query")
    @patch("app.generate_activity_smart_summary")
    def test_ai_activity_summary_uses_full_customer_history_and_returns_three_insights(
        self, mock_summary, mock_query, _mock_access
    ):
        user = self.authenticated_client()
        activities = [
            {"type": "CALL", "subject": "Initial call", "details": "Need reporting", "occurredAt": "2026-01-01"},
            {"type": "MEETING", "subject": "Follow up", "details": "Interested in rollout", "occurredAt": "2026-02-01"},
        ]
        mock_query.side_effect = [
            [{"id": 44}],
            [{"sensitiveName": "Acme Corporation"}],
            activities,
        ]
        mock_summary.return_value = {
            "needs": "Báo cáo bán hàng.",
            "sentiment": "Tích cực.",
            "next_step": "Gửi kế hoạch triển khai.",
            "model": "gemini-test",
        }
        with patch.object(api, "get_user", return_value=user):
            response = self.client.post("/api/ai/summarize", json={"customerId": 44})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["activitiesCount"], 2)
        self.assertEqual(response.json["summary"]["needs"], "Báo cáo bán hàng.")
        self.assertEqual(response.json["summary"]["sentiment"], "Tích cực.")
        self.assertEqual(response.json["summary"]["next_step"], "Gửi kế hoạch triển khai.")
        activity_query = mock_query.call_args_list[2]
        self.assertNotIn("LIMIT", activity_query.args[0].upper())
        self.assertIn("act.contact_id IN", activity_query.args[0])
        self.assertIn("act.deal_id IN", activity_query.args[0])
        self.assertIn("act.user_id=%s", activity_query.args[0])
        self.assertEqual(activity_query.args[1], (44, 44, 44, 44, user["id"]))

    @patch("app.can_access_customer", return_value=True)
    @patch("app.query")
    def test_ai_activity_summary_reports_empty_history_without_calling_ai(self, mock_query, _mock_access):
        user = self.authenticated_client()
        mock_query.side_effect = [[{"id": 44}], [], []]
        with patch.object(api, "get_user", return_value=user), patch.object(api, "generate_activity_smart_summary") as mock_summary:
            response = self.client.post("/api/ai/summarize", json={"customerId": 44})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json["code"], "NO_ACTIVITIES")
        mock_summary.assert_not_called()

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
