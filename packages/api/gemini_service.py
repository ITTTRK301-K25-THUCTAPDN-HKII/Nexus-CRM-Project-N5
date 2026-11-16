import json
import os
import re
from typing import Any, Dict, List, Optional
from google import genai


class GeminiConfigurationError(Exception):
    """Raised when GEMINI_API_KEY is missing or invalid."""
    pass


class GeminiServiceError(Exception):
    """Raised when the Gemini API returns an error."""
    pass


ACCOUNT_BRIEF_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "relationship_health": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["EXCELLENT", "GOOD", "NEEDS_ATTENTION", "AT_RISK"],
                },
                "score": {"type": "integer"},
                "headline": {"type": "string"},
            },
            "required": ["status", "score", "headline"],
        },
        "executive_summary": {"type": "string"},
        "key_highlights": {
            "type": "array",
            "items": {"type": "string"},
        },
        "risks": {
            "type": "array",
            "items": {"type": "string"},
        },
        "opportunities": {
            "type": "array",
            "items": {"type": "string"},
        },
        "recommended_actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "priority": {
                        "type": "string",
                        "enum": ["HIGH", "MEDIUM", "LOW"],
                    },
                    "due_days": {"type": "integer"},
                    "rationale": {"type": "string"},
                },
                "required": ["title", "priority", "due_days", "rationale"],
            },
        },
        "email_draft": {
            "type": "object",
            "properties": {
                "recipient_name": {"type": "string"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["recipient_name", "subject", "body"],
        },
    },
    "required": [
        "relationship_health",
        "executive_summary",
        "key_highlights",
        "risks",
        "opportunities",
        "recommended_actions",
        "email_draft",
    ],
}


def clean_json_markdown(text: str) -> str:
    """Strip markdown code block tags if present."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    return text


def build_account_context(
    account: Dict[str, Any],
    contacts: List[Dict[str, Any]],
    deals: List[Dict[str, Any]],
    activities: List[Dict[str, Any]],
) -> str:
    """Format structured account data for Gemini prompt."""
    parts = []

    parts.append("=== THÔNG TIN DOANH NGHIỆP (ACCOUNT) ===")
    parts.append(f"Tên: {account.get('name', 'N/A')}")
    parts.append(f"Ngành nghề: {account.get('industry') or 'Chưa phân loại'}")
    parts.append(f"Website: {account.get('website') or 'Không có'}")
    parts.append(f"Email: {account.get('email') or 'Không có'}")
    parts.append(f"Điện thoại: {account.get('phone') or 'Không có'}")
    parts.append(f"Địa chỉ: {account.get('billingAddress') or 'Không có'}")
    parts.append(f"Nhân viên phụ trách (Sale Owner): {account.get('ownerName', 'N/A')}")
    parts.append(f"Ngày tạo: {account.get('createdAt', 'N/A')}")

    parts.append("\n=== DANH SÁCH NGƯỜI LIÊN HỆ (CONTACTS) ===")
    if contacts:
        for idx, c in enumerate(contacts, 1):
            full_name = f"{c.get('firstName', '')} {c.get('lastName', '')}".strip()
            title = c.get('jobTitle') or 'Không rõ chức vụ'
            email = c.get('email') or 'Không có email'
            phone = c.get('phone') or 'Không có SĐT'
            parts.append(f"{idx}. {full_name} ({title}) - Email: {email}, SĐT: {phone}")
    else:
        parts.append("Chưa có liên hệ nào.")

    parts.append("\n=== CÁC CƠ HỘI BÁN HÀNG (DEALS) ===")
    if deals:
        for idx, d in enumerate(deals, 1):
            name = d.get('name', 'Deal')
            amount = d.get('amount', 0)
            curr = d.get('currency', 'USD')
            stage = d.get('stage', 'N/A')
            prob = d.get('probability', 0)
            close_date = d.get('expectedCloseDate') or 'Chưa rõ'
            parts.append(f"{idx}. {name}: {curr} {amount:,.2f} | Giai đoạn: {stage} | Xác suất: {prob}% | Dự kiến chốt: {close_date}")
    else:
        parts.append("Chưa có cơ hội bán hàng nào.")

    parts.append("\n=== LỊCH SỬ TƯƠNG TÁC GẦN ĐÂY (ACTIVITIES) ===")
    if activities:
        for idx, a in enumerate(activities, 1):
            act_type = a.get('type', 'OTHER')
            subject = a.get('subject', '')
            details = a.get('details') or ''
            occurred = a.get('occurredAt', 'N/A')
            parts.append(f"{idx}. [{act_type}] {subject} ({occurred})")
            if details:
                parts.append(f"   Chi tiết: {details}")
    else:
        parts.append("Chưa có tương tác nào được ghi nhận.")

    return "\n".join(parts)


def generate_account_copilot_brief(
    account: Dict[str, Any],
    contacts: List[Dict[str, Any]],
    deals: List[Dict[str, Any]],
    activities: List[Dict[str, Any]],
    custom_instructions: Optional[str] = None,
) -> Dict[str, Any]:
    """Analyze account 360 data using Gemini API and return structured strategic insights."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise GeminiConfigurationError(
            "Chưa cấu hình GEMINI_API_KEY. Vui lòng thêm GEMINI_API_KEY vào file .env để sử dụng Gemini AI."
        )

    model_name = os.getenv("GEMINI_MODEL", "gemini-4-hydrogen").strip()
    client = genai.Client(api_key=api_key)

    context_text = build_account_context(account, contacts, deals, activities)

    prompt = f"""Bạn là một chuyên gia cố vấn bán hàng B2B và chiến lược quản lý quan hệ khách hàng (CRM Copilot) cho doanh nghiệp.
Dưới đây là toàn bộ hồ sơ dữ liệu Customer 360° của khách hàng:

{context_text}

{f"YÊU CẦU THÊM TỪ NGƯỜI DÙNG: {custom_instructions}" if custom_instructions else ""}

NHIỆM VỤ CỦA BẠN:
1. Đánh giá chỉ số sức khỏe quan hệ (relationship_health):
   - status: Chọn 1 trong 4 mức ("EXCELLENT", "GOOD", "NEEDS_ATTENTION", "AT_RISK").
   - score: Thang điểm 0-100 (tính toán dựa trên tần suất tương tác, tỷ lệ deal thành công, thời gian bỏ ngỏ).
   - headline: 1 câu tóm tắt ngắn gọn tình trạng mối quan hệ bằng tiếng Việt.
2. Tóm tắt điều hành (executive_summary):
   - Đoạn văn 2-3 câu ngắn gọn, súc tích về đặc điểm khách hàng, tiến độ kinh doanh chính và trọng tâm hiện tại.
3. Điểm nhấn chính (key_highlights):
   - Danh sách 3-4 gạch đầu dòng những điểm quan trọng nhất cần nhớ trước khi làm việc với khách hàng này.
4. Rủi ro tiềm ẩn (risks):
   - Danh sách các rủi ro cụ thể (ví dụ: deal bị đình trệ, thiếu người liên hệ cấp cao, thời gian dài chưa tương tác).
5. Cơ hội kinh doanh (opportunities):
   - Danh sách các cơ hội mở rộng hoặc bán chéo (upsell/cross-sell) phù hợp với hồ sơ khách hàng.
6. Hành động tiếp theo được đề xuất (recommended_actions):
   - Danh sách 2-4 hành động cụ thể, thiết thực cho nhân viên kinh doanh.
   - Mỗi hành động gồm: title (tiêu đề công việc ngắn gọn có thể lưu trực tiếp vào Task), priority ("HIGH", "MEDIUM", "LOW"), due_days (số ngày đề xuất hoàn thành tính từ hôm nay, ví dụ: 2, 5, 7), và rationale (lý do nên làm).
7. Mẫu Email chăm sóc cá nhân hóa (email_draft):
   - recipient_name: Tên người nhận (chọn liên hệ phù hợp nhất từ danh sách Contacts, nếu chưa có thì để 'Quý đối tác').
   - subject: Tiêu đề email chuyên nghiệp, thu hút.
   - body: Nội dung email tiếng Việt tự nhiên, ấm áp, thể hiện sự am hiểu về khách hàng và đưa ra lời kêu gọi hành động (CTA) rõ ràng.

Trả về kết quả bằng định dạng JSON tuân thủ schema được cung cấp. Tất cả nội dung văn bản phải bằng tiếng Việt chuẩn mực.
"""

    try:
        interaction = client.interactions.create(
            model=model_name,
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": ACCOUNT_BRIEF_SCHEMA,
            },
        )
        output_text = interaction.output_text
        if not output_text:
            raise GeminiServiceError("Mô hình Gemini không trả về dữ liệu nội dung.")

        cleaned = clean_json_markdown(output_text)
        result = json.loads(cleaned)
        result["model"] = model_name
        return result
    except GeminiConfigurationError:
        raise
    except json.JSONDecodeError as exc:
        raise GeminiServiceError(f"Dữ liệu JSON từ Gemini không hợp lệ: {str(exc)}") from exc
    except Exception as exc:
        error_msg = str(exc)
        if "API_KEY_INVALID" in error_msg or "API key not valid" in error_msg:
            raise GeminiConfigurationError("GEMINI_API_KEY không hợp lệ. Vui lòng kiểm tra lại API key trong .env.") from exc
        if "RESOURCE_EXHAUSTED" in error_msg or "quota" in error_msg.lower():
            raise GeminiServiceError("Đã vượt quá giới hạn quota gọi Gemini API. Vui lòng thử lại sau.") from exc
        raise GeminiServiceError(f"Lỗi khi gọi Gemini API: {error_msg}") from exc
