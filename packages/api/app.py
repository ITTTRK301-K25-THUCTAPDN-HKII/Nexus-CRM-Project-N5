import hashlib
import os
import re
import secrets
import threading
import time
from datetime import date
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from functools import wraps
from pathlib import Path
from urllib.parse import quote

import bcrypt
import jwt
import mysql.connector
from dotenv import load_dotenv
from flask import Flask, g, jsonify, make_response, render_template, request, send_from_directory
from flask.json.provider import DefaultJSONProvider
from mysql.connector import IntegrityError, errorcode
from werkzeug.exceptions import HTTPException


ROOT = Path(__file__).resolve().parents[2]
API_DIR = Path(__file__).resolve().parent
load_dotenv(API_DIR / ".env")
load_dotenv(ROOT / ".env", override=False)

NODE_ENV = os.getenv("NODE_ENV", "development")
JWT_SECRET = os.getenv("JWT_SECRET", "local-demo-secret-change-before-deploy-32")
if NODE_ENV == "production" and (
    len(JWT_SECRET) < 32 or JWT_SECRET == "local-demo-secret-change-before-deploy-32"
):
    raise RuntimeError("JWT_SECRET must be explicitly configured outside development.")

WEB_DIR = ROOT / "apps" / "web"
app = Flask(
    __name__,
    template_folder=str(WEB_DIR / "templates"),
    static_folder=str(WEB_DIR / "static"),
)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024


class APIJSONProvider(DefaultJSONProvider):
    @staticmethod
    def default(value):
        if isinstance(value, (date, datetime)):
            return value.isoformat()
        if isinstance(value, Decimal):
            return float(value)
        return DefaultJSONProvider.default(value)


app.json = APIJSONProvider(app)

_rate_lock = threading.Lock()
_rate_events: dict[str, list[float]] = {}


def db_connect():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "nexus_crm"),
        autocommit=False,
        charset="utf8mb4",
        collation="utf8mb4_0900_ai_ci",
    )


def query(sql, values=()):
    connection = db_connect()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(sql, values)
        return cursor.fetchall()
    finally:
        connection.close()


def execute(sql, values=()):
    connection = db_connect()
    try:
        cursor = connection.cursor()
        cursor.execute(sql, values)
        connection.commit()
        return cursor.lastrowid, cursor.rowcount
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def transaction(work):
    connection = db_connect()
    try:
        cursor = connection.cursor(dictionary=True)
        result = work(cursor)
        connection.commit()
        return result
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def json_error(message, status, **extra):
    return jsonify({"message": message, **extra}), status


def validation_error(fields):
    return json_error(
        "Dữ liệu không hợp lệ.",
        400,
        errors=[{"field": field, "message": message} for field, message in fields],
    )


def clean_text(value, field, maximum, required=False, minimum=0):
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValueError(f"{field} không hợp lệ.")
    value = value.strip()
    if required and len(value) < minimum:
        raise ValueError(f"{field} phải có ít nhất {minimum} ký tự.")
    if len(value) > maximum:
        raise ValueError(f"{field} vượt quá {maximum} ký tự.")
    return value


def valid_email(value, required=False):
    value = clean_text(value, "Email", 254, required=required)
    if value and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
        raise ValueError("Email không hợp lệ.")
    return value.lower() or None


def positive_id(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValueError("ID không hợp lệ.")
    if parsed < 1:
        raise ValueError("ID không hợp lệ.")
    return parsed


def body_object():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ValueError("Dữ liệu không hợp lệ.")
    return value


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def public_user(user):
    if not user:
        return None
    return {
        "id": int(user["id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "status": user["status"],
    }


def get_user(user_id):
    rows = query(
        "SELECT id, name, email, role, status FROM users WHERE id = %s",
        (user_id,),
    )
    return public_user(rows[0]) if rows else None


def issue_access_token(user):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user["id"]),
            "role": user["role"],
            "iss": "nexus-crm",
            "aud": "nexus-web",
            "iat": now,
            "exp": now + timedelta(minutes=15),
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def set_auth_cookies(response, user, refresh_token=None):
    response.set_cookie(
        "nexus_access",
        issue_access_token(user),
        max_age=15 * 60,
        httponly=True,
        secure=NODE_ENV == "production",
        samesite="Lax",
        path="/api",
    )
    if refresh_token:
        response.set_cookie(
            "nexus_refresh",
            refresh_token,
            max_age=7 * 24 * 60 * 60,
            httponly=True,
            secure=NODE_ENV == "production",
            samesite="Lax",
            path="/api/auth",
        )


def clear_auth_cookies(response):
    response.delete_cookie(
        "nexus_access",
        path="/api",
        httponly=True,
        secure=NODE_ENV == "production",
        samesite="Lax",
    )
    response.delete_cookie(
        "nexus_refresh",
        path="/api/auth",
        httponly=True,
        secure=NODE_ENV == "production",
        samesite="Lax",
    )


def auth_required(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        token = request.cookies.get("nexus_access")
        if not token:
            return json_error("Vui lòng đăng nhập.", 401)
        try:
            payload = jwt.decode(
                token,
                JWT_SECRET,
                algorithms=["HS256"],
                issuer="nexus-crm",
                audience="nexus-web",
            )
            user_id = positive_id(payload.get("sub"))
        except (jwt.PyJWTError, ValueError, TypeError):
            return json_error("Phiên đăng nhập đã hết hạn.", 401)
        user = get_user(user_id)
        if not user or user["status"] != "ACTIVE":
            return json_error("Tài khoản không hoạt động.", 401)
        g.user = user
        return function(*args, **kwargs)

    return wrapped


def roles_required(*roles):
    def decorate(function):
        @wraps(function)
        @auth_required
        def wrapped(*args, **kwargs):
            if g.user["role"] not in roles:
                return json_error("Bạn không có quyền thực hiện thao tác này.", 403)
            return function(*args, **kwargs)

        return wrapped

    return decorate


def rate_limited(key, limit=5, window=900, message="Bạn đã thử quá nhiều lần. Vui lòng thử lại sau."):
    now = time.monotonic()
    with _rate_lock:
        history = [stamp for stamp in _rate_events.get(key, []) if now - stamp < window]
        if len(history) >= limit:
            _rate_events[key] = history
            response = jsonify({"message": message})
            response.status_code = 429
            response.headers["Retry-After"] = str(max(1, int(window - (now - history[0]))))
            response.headers["RateLimit-Limit"] = str(limit)
            response.headers["RateLimit-Remaining"] = "0"
            return response
        history.append(now)
        _rate_events[key] = history
    return None


def rate_limit_exceeded(key, limit=5, window=900, message="Bạn đã thử quá nhiều lần. Vui lòng thử lại sau."):
    now = time.monotonic()
    with _rate_lock:
        history = [stamp for stamp in _rate_events.get(key, []) if now - stamp < window]
        _rate_events[key] = history
        if len(history) < limit:
            return None
        response = jsonify({"message": message})
        response.status_code = 429
        response.headers["Retry-After"] = str(max(1, int(window - (now - history[0]))))
        response.headers["RateLimit-Limit"] = str(limit)
        response.headers["RateLimit-Remaining"] = "0"
        return response


def password_hash(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def validate_password(value, minimum=8):
    if not isinstance(value, str) or not minimum <= len(value) <= 128:
        raise ValueError(f"Mật khẩu cần có từ {minimum} đến 128 ký tự.")
    return value


def page_options():
    try:
        page = max(1, min(100000, int(request.args.get("page", "1"))))
        page_size = max(1, min(50, int(request.args.get("pageSize", "10"))))
    except ValueError:
        page, page_size = 1, 10
    search = request.args.get("search", "").strip()[:100]
    return page, page_size, (page - 1) * page_size, search


def ownership(user, column="owner_user_id"):
    if user["role"] == "Admin":
        return "", []
    return f"{column} = %s", [user["id"]]


def deal_scope(user, column="owner_user_id"):
    if user["role"] == "Admin":
        return "", []
    if user["role"] == "Manager":
        return f"{column} IN (SELECT id FROM users WHERE role='Sale')", []
    return f"{column} = %s", [user["id"]]


def deal_payload(data, partial=False):
    allowed = {
        "accountId", "contactId", "ownerUserId", "name", "amount", "currency",
        "stage", "probability", "expectedCloseDate",
    }
    if any(field not in allowed for field in data):
        raise ValueError("Dữ liệu Deal chứa trường không hợp lệ.")
    if not partial and not {"accountId", "name"}.issubset(data):
        raise ValueError("Deal cần có Account và tên.")

    result = {}
    if "accountId" in data or not partial:
        result["accountId"] = positive_id(data.get("accountId"))
    if "contactId" in data:
        result["contactId"] = None if data["contactId"] in (None, "") else positive_id(data["contactId"])
    if "ownerUserId" in data:
        result["ownerUserId"] = positive_id(data["ownerUserId"])
    if "name" in data or not partial:
        result["name"] = clean_text(data.get("name"), "Tên Deal", 180, True, 2)
    if "amount" in data:
        try:
            amount = Decimal(str(data["amount"]))
        except (InvalidOperation, ValueError) as error:
            raise ValueError("Giá trị Deal không hợp lệ.") from error
        if not amount.is_finite() or amount < 0 or amount > Decimal("9999999999999.99"):
            raise ValueError("Giá trị Deal phải nằm trong khoảng 0 đến 9999999999999.99.")
        result["amount"] = amount.quantize(Decimal("0.01"))
    if "currency" in data:
        currency = clean_text(data["currency"], "Loại tiền", 3, True, 3).upper()
        if not re.fullmatch(r"[A-Z]{3}", currency):
            raise ValueError("Loại tiền phải gồm 3 ký tự chữ.")
        result["currency"] = currency
    if "stage" in data:
        stage = data["stage"]
        if stage not in ("PROSPECTING", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "WON", "LOST"):
            raise ValueError("Giai đoạn Deal không hợp lệ.")
        result["stage"] = stage
    if "probability" in data:
        try:
            probability = int(data["probability"])
        except (TypeError, ValueError) as error:
            raise ValueError("Xác suất Deal không hợp lệ.") from error
        if isinstance(data["probability"], bool) or str(probability) != str(data["probability"]) or not 0 <= probability <= 100:
            raise ValueError("Xác suất Deal phải từ 0 đến 100.")
        result["probability"] = probability
    if "expectedCloseDate" in data:
        close_date = data["expectedCloseDate"]
        if close_date in (None, ""):
            result["expectedCloseDate"] = None
        else:
            try:
                datetime.strptime(close_date, "%Y-%m-%d")
            except (TypeError, ValueError) as error:
                raise ValueError("Ngày dự kiến kết thúc không hợp lệ.") from error
            result["expectedCloseDate"] = close_date
    return result


def validate_deal_relations(cursor, deal_data, owner_id):
    account_id = deal_data.get("accountId")
    if account_id is None:
        return
    cursor.execute(
        "SELECT id FROM accounts WHERE id=%s AND owner_user_id=%s",
        (account_id, owner_id),
    )
    if not cursor.fetchone():
        raise LookupError("Không tìm thấy Account thuộc nhân viên phụ trách Deal.")
    contact_id = deal_data.get("contactId")
    if contact_id is not None:
        cursor.execute(
            "SELECT id FROM contacts WHERE id=%s AND account_id=%s AND owner_user_id=%s",
            (contact_id, account_id, owner_id),
        )
        if not cursor.fetchone():
            raise LookupError("Contact phải thuộc Account và nhân viên phụ trách Deal.")


def deal_select(where=""):
    return (
        "SELECT d.id,d.account_id AS accountId,a.name AS accountName,"
        "d.contact_id AS contactId,CONCAT_WS(' ',c.first_name,c.last_name) AS contactName,"
        "d.owner_user_id AS ownerUserId,u.name AS ownerName,d.name,d.amount,d.currency,"
        "d.stage,d.probability,d.version,d.expected_close_date AS expectedCloseDate,"
        "d.closed_amount AS closedAmount,d.closed_date AS closedDate,d.lost_reason AS lostReason,"
        "d.created_at AS createdAt,d.updated_at AS updatedAt "
        "FROM deals d INNER JOIN accounts a ON a.id=d.account_id "
        "INNER JOIN users u ON u.id=d.owner_user_id "
        "LEFT JOIN contacts c ON c.id=d.contact_id" + where
    )


def can_access_customer(user, entity, entity_id):
    if user["role"] == "Admin":
        return True
    if entity == "contacts":
        extra = "" if user["role"] == "Admin" else " AND c.owner_user_id = %s AND a.owner_user_id = %s"
        values = (entity_id,) if not extra else (entity_id, user["id"], user["id"])
        return bool(query(
            "SELECT c.id FROM contacts c INNER JOIN accounts a ON a.id=c.account_id "
            "WHERE c.id=%s" + extra + " LIMIT 1",
            values,
        ))
    extra = "" if user["role"] == "Admin" else " AND owner_user_id=%s"
    values = (entity_id,) if not extra else (entity_id, user["id"])
    if entity == "leads":
        extra += " AND deleted_at IS NULL"
    return bool(query(f"SELECT id FROM {entity} WHERE id=%s{extra} LIMIT 1", values))


def lead_payload(data, require_name=True):
    name = clean_text(data.get("name", ""), "Họ tên", 160, require_name, 2)
    company = clean_text(data.get("company", ""), "Công ty", 160) or None
    email = valid_email(data.get("email", ""))
    phone = clean_text(data.get("phone", ""), "Số điện thoại", 40)
    phone = re.sub(r"[\s().-]", "", phone) or None
    if phone and not re.fullmatch(r"\+?\d{6,20}", phone):
        raise ValueError("Số điện thoại không hợp lệ.")
    if not email and not phone:
        raise ValueError("Lead cần có ít nhất email hoặc số điện thoại.")
    source = clean_text(data.get("source", ""), "Nguồn", 80) or None
    notes = clean_text(data.get("notes", ""), "Ghi chú", 5000) or None
    status = data.get("status", "NEW")
    if status not in ("NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"):
        raise ValueError("Trạng thái Lead không hợp lệ.")
    return {
        "name": name, "company": company, "email": email, "phone": phone,
        "source": source, "notes": notes, "status": status,
    }


def find_duplicate_lead(email, phone, excluded_id=None):
    conditions, values = [], []
    if email:
        conditions.append("LOWER(email)=LOWER(%s)")
        values.append(email)
    if phone:
        conditions.append("phone=%s")
        values.append(phone)
    if not conditions:
        return None
    exclude = ""
    if excluded_id:
        exclude = " AND id<>%s"
        values.append(excluded_id)
    rows = query(
        "SELECT id,name,email,phone FROM leads WHERE (" + " OR ".join(conditions) + ")" + exclude + " LIMIT 1",
        tuple(values),
    )
    return rows[0] if rows else None


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/deals")
@auth_required
def deals_list():
    """Trả danh sách Deal có thể lọc hoặc phân trang theo phạm vi vai trò."""
    page, page_size, offset, search = page_options()
    scope, values = deal_scope(g.user, "d.owner_user_id")
    filters = [scope] if scope else []
    if search:
        filters.append("(d.name LIKE %s OR a.name LIKE %s)")
        values.extend([f"%{search}%", f"%{search}%"])
    stage = request.args.get("stage")
    if stage:
        if stage not in ("PROSPECTING", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "WON", "LOST"):
            return json_error("Giai đoạn Deal không hợp lệ.", 400)
        filters.append("d.stage=%s")
        values.append(stage)
    account_id = request.args.get("accountId")
    if account_id:
        try:
            filters.append("d.account_id=%s")
            values.append(positive_id(account_id))
        except ValueError as error:
            return json_error(str(error), 400)
    where = " WHERE " + " AND ".join(filters) if filters else ""
    paginated = "page" in request.args or "pageSize" in request.args
    sql = deal_select(where) + " ORDER BY d.expected_close_date IS NULL,d.expected_close_date,d.id"
    query_values = list(values)
    if paginated:
        sql += " LIMIT %s OFFSET %s"
        query_values.extend([page_size, offset])
    items = query(sql, tuple(query_values))
    if paginated or filters:
        total_rows = query(
            "SELECT COUNT(*) AS total FROM deals d INNER JOIN accounts a ON a.id=d.account_id" + where,
            tuple(values),
        )
        total = total_rows[0]["total"]
    else:
        total = len(items)
    return jsonify({
        "deals": items, "items": items, "page": page, "pageSize": page_size,
        "total": total,
    })


@app.post("/api/deals")
@auth_required
def deal_create():
    try:
        data = deal_payload(body_object())
        if g.user["role"] == "Sale":
            requested_owner = data.get("ownerUserId", g.user["id"])
            if requested_owner != g.user["id"]:
                return json_error("Sale chỉ được tạo Deal cho chính mình.", 403)
            owner_id = g.user["id"]
        else:
            if "ownerUserId" not in data:
                raise ValueError("Cần chỉ định nhân viên Sale phụ trách Deal.")
            owner_id = data["ownerUserId"]
    except ValueError as error:
        return validation_error([("body", str(error))])

    def create(cursor):
        cursor.execute(
            "SELECT id FROM users WHERE id=%s AND role='Sale' AND status='ACTIVE'",
            (owner_id,),
        )
        if not cursor.fetchone():
            raise LookupError("Nhân viên phụ trách phải là Sale đang hoạt động.")
        validate_deal_relations(cursor, data, owner_id)
        cursor.execute(
            "INSERT INTO deals (account_id,contact_id,owner_user_id,name,amount,currency,stage,probability,expected_close_date) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                data["accountId"], data.get("contactId"), owner_id, data["name"],
                data.get("amount", Decimal("0.00")), data.get("currency", "USD"),
                data.get("stage", "PROSPECTING"), data.get("probability", 0),
                data.get("expectedCloseDate"),
            ),
        )
        deal_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO deal_history (deal_id,changed_by_user_id,previous_stage,new_stage,previous_amount,new_amount,note) "
            "VALUES (%s,%s,NULL,%s,NULL,%s,%s)",
            (
                deal_id, g.user["id"], data.get("stage", "PROSPECTING"),
                data.get("amount", Decimal("0.00")), "Tạo Deal",
            ),
        )
        return deal_id

    try:
        deal_id = transaction(create)
    except LookupError as error:
        return json_error(str(error), 404)
    deal = query(deal_select(" WHERE d.id=%s"), (deal_id,))[0]
    return jsonify({"deal": deal}), 201


@app.get("/api/deals/<deal_id>")
@auth_required
def deal_get(deal_id):
    try:
        parsed_id = positive_id(deal_id)
    except ValueError as error:
        return json_error(str(error), 400)
    scope, values = deal_scope(g.user, "d.owner_user_id")
    where = " WHERE d.id=%s" + (f" AND {scope}" if scope else "")
    rows = query(deal_select(where), tuple([parsed_id] + values))
    if not rows:
        return json_error("Không tìm thấy Deal.", 404)
    return jsonify({"deal": rows[0]})


@app.patch("/api/deals/<deal_id>")
@app.put("/api/deals/<deal_id>")
@auth_required
def deal_update(deal_id):
    try:
        parsed_id = positive_id(deal_id)
        data = deal_payload(body_object(), partial=True)
    except ValueError as error:
        return validation_error([("body", str(error))])
    if not data:
        return json_error("Cần cung cấp ít nhất một trường để cập nhật.", 400)
    if "stage" in data:
        return json_error("Hãy sử dụng API cập nhật stage để đổi giai đoạn Deal.", 400)
    if "ownerUserId" in data and g.user["role"] == "Sale":
        return json_error("Sale không có quyền chuyển Deal sang nhân viên khác.", 403)

    def update(cursor):
        scope, scope_values = deal_scope(g.user)
        where = "id=%s" + (f" AND {scope}" if scope else "")
        cursor.execute(
            "SELECT id,account_id AS accountId,contact_id AS contactId,owner_user_id AS ownerUserId,"
            "name,amount,currency,stage,probability,expected_close_date AS expectedCloseDate "
            "FROM deals WHERE " + where + " FOR UPDATE",
            tuple([parsed_id] + scope_values),
        )
        existing = cursor.fetchone()
        if not existing:
            return None

        updated = dict(existing)
        updated.update(data)
        owner_id = updated["ownerUserId"]
        if "ownerUserId" in data:
            cursor.execute(
                "SELECT id FROM users WHERE id=%s AND role='Sale' AND status='ACTIVE'",
                (owner_id,),
            )
            if not cursor.fetchone():
                raise LookupError("Nhân viên phụ trách phải là Sale đang hoạt động.")
        validate_deal_relations(cursor, updated, owner_id)

        columns = {
            "accountId": "account_id", "contactId": "contact_id",
            "ownerUserId": "owner_user_id", "name": "name", "amount": "amount",
            "currency": "currency", "probability": "probability",
            "expectedCloseDate": "expected_close_date",
        }
        assignments = [f"{columns[field]}=%s" for field in data]
        cursor.execute(
            "UPDATE deals SET " + ",".join(assignments) + ",version=version+1 WHERE id=%s",
            tuple(list(data.values()) + [parsed_id]),
        )

        amount_changed = Decimal(str(updated["amount"])) != Decimal(str(existing["amount"]))
        if amount_changed:
            cursor.execute(
                "INSERT INTO deal_history (deal_id,changed_by_user_id,previous_stage,new_stage,previous_amount,new_amount,note) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (
                    parsed_id, g.user["id"], existing["stage"], existing["stage"],
                    existing["amount"], updated["amount"],
                    f"Giá trị: {existing['amount']} → {updated['amount']}",
                ),
            )
        return parsed_id

    try:
        result_id = transaction(update)
    except LookupError as error:
        return json_error(str(error), 404)
    if result_id is None:
        return json_error("Không tìm thấy Deal.", 404)
    deal = query(deal_select(" WHERE d.id=%s"), (result_id,))[0]
    return jsonify({"deal": deal})


@app.delete("/api/deals/<deal_id>")
@auth_required
def deal_delete(deal_id):
    """Xóa Deal trong phạm vi vai trò; giữ Deal đang được Quote tham chiếu."""
    try:
        parsed_id = positive_id(deal_id)
    except ValueError as error:
        return json_error(str(error), 400)

    def delete(cursor):
        scope, values = deal_scope(g.user)
        where = "id=%s" + (f" AND {scope}" if scope else "")
        cursor.execute(
            "SELECT id FROM deals WHERE " + where + " FOR UPDATE",
            tuple([parsed_id] + values),
        )
        if not cursor.fetchone():
            return "not_found"

        cursor.execute("SELECT id FROM quotes WHERE deal_id=%s LIMIT 1", (parsed_id,))
        if cursor.fetchone():
            return "has_quotes"

        cursor.execute("DELETE FROM deals WHERE id=%s", (parsed_id,))
        return "deleted"

    result = transaction(delete)
    if result == "not_found":
        return json_error("Không tìm thấy Deal hoặc bạn không có quyền xóa.", 404)
    if result == "has_quotes":
        return json_error("Không thể xóa Deal đã có Báo giá liên kết.", 409)
    return "", 204


@app.get("/api/deals/<deal_id>/history")
@auth_required
def deal_history(deal_id):
    """Trả lịch sử Deal theo đúng phạm vi dữ liệu của vai trò đăng nhập."""
    try:
        parsed_id = positive_id(deal_id)
    except ValueError as error:
        return json_error(str(error), 400)

    scope, values = deal_scope(g.user, "d.owner_user_id")
    where = "d.id=%s" + (f" AND {scope}" if scope else "")
    if not query(
        "SELECT d.id FROM deals d WHERE " + where + " LIMIT 1",
        tuple([parsed_id] + values),
    ):
        return json_error("Không tìm thấy Deal.", 404)

    history = query(
        "SELECT h.id,h.deal_id AS dealId,h.changed_by_user_id AS changedByUserId,"
        "u.name AS changedByName,h.previous_stage AS previousStage,h.new_stage AS newStage,"
        "h.previous_amount AS previousAmount,h.new_amount AS newAmount,h.note,"
        "h.changed_at AS changedAt FROM deal_history h "
        "LEFT JOIN users u ON u.id=h.changed_by_user_id "
        "WHERE h.deal_id=%s ORDER BY h.changed_at ASC,h.id ASC",
        (parsed_id,),
    )
    return jsonify({"history": history})


@app.patch("/api/deals/<id>/stage")
@auth_required
def deal_stage_update(id):
    """Đổi stage trong transaction, kiểm tra phạm vi quyền và ghi DealHistory."""
    try:
        parsed_id = positive_id(id)
        data = body_object()
        stage = data.get("stage")
        expected_stage = data.get("expectedStage")
        expected_version = data.get("expectedVersion")
        lost_reason = clean_text(data.get("lostReason", ""), "Lý do thất bại", 1000)
        closed_amount = None
        closed_date = None
        if stage not in ("PROSPECTING", "PROPOSAL", "NEGOTIATION", "WON", "LOST"):
            raise ValueError("Trạng thái Deal không hợp lệ.")
        if not isinstance(expected_stage, str):
            raise ValueError("Thiếu trạng thái hiện tại của Deal.")
        if not isinstance(expected_version, int) or expected_version < 1:
            raise ValueError("Phiên bản Deal không hợp lệ. Hãy tải lại bảng.")
        if stage == "WON":
            try:
                closed_amount = Decimal(str(data.get("closedAmount", "")))
            except InvalidOperation as error:
                raise ValueError("Giá trị hợp đồng thực tế không hợp lệ.") from error
            if not closed_amount.is_finite() or closed_amount <= 0:
                raise ValueError("Giá trị hợp đồng thực tế phải lớn hơn 0.")
            try:
                closed_date = date.fromisoformat(str(data.get("closedDate", "")))
            except ValueError as error:
                raise ValueError("Cần nhập ngày chốt hợp đồng hợp lệ.") from error
    except ValueError as error:
        return json_error(str(error), 400)

    transitions = {
        "PROSPECTING": {"PROPOSAL"}, "QUALIFICATION": {"PROPOSAL"},
        "PROPOSAL": {"PROSPECTING", "NEGOTIATION"},
        "NEGOTIATION": {"PROPOSAL", "WON", "LOST"},
        "WON": set(), "LOST": set(),
    }

    def change_stage(cursor):
        # Khóa dòng Deal trong lúc cập nhật để hai lần kéo thả không ghi đè nhau.
        cursor.execute(
            "SELECT d.id,d.owner_user_id AS ownerUserId,u.role AS ownerRole,d.stage,d.amount,d.version,"
            "d.expected_close_date AS expectedCloseDate FROM deals d "
            "INNER JOIN users u ON u.id=d.owner_user_id WHERE d.id=%s FOR UPDATE", (parsed_id,),
        )
        deal = cursor.fetchone()
        if not deal:
            return {"kind": "not_found"}
        can_manage = (
            g.user["role"] == "Admin"
            or (g.user["role"] == "Manager" and deal["ownerRole"] == "Sale")
            or (g.user["role"] == "Sale" and deal["ownerUserId"] == g.user["id"])
        )
        if not can_manage:
            return {"kind": "forbidden"}
        if deal["version"] != expected_version:
            return {"kind": "conflict"}
        if deal["stage"] != expected_stage:
            return {"kind": "conflict"}
        if stage not in transitions.get(deal["stage"], set()):
            return {"kind": "invalid_transition"}
        if stage == "LOST" and not lost_reason:
            return {"kind": "missing_lost_reason"}

        cursor.execute(
            "UPDATE deals SET stage=%s,closed_amount=%s,closed_date=%s,lost_reason=%s,version=version+1 "
            "WHERE id=%s AND version=%s",
            (stage, closed_amount, closed_date, lost_reason or None, parsed_id, expected_version),
        )
        if cursor.rowcount != 1:
            return {"kind": "conflict"}
        cursor.execute(
            "INSERT INTO deal_history (deal_id,changed_by_user_id,previous_stage,new_stage,previous_amount,new_amount,note) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (parsed_id, g.user["id"], deal["stage"], stage, deal["amount"], closed_amount or deal["amount"],
             lost_reason or (f"Hợp đồng thực tế: {closed_amount}; ngày chốt: {closed_date}" if stage == "WON" else None)),
        )
        return {
            "kind": "updated", "stage": stage, "version": expected_version + 1,
            "closedAmount": closed_amount, "closedDate": closed_date, "lostReason": lost_reason or None,
        }

    result = transaction(change_stage)
    errors = {
        "not_found": ("Không tìm thấy Deal hoặc bạn không có quyền thao tác.", 404),
        "forbidden": ("Bạn không có quyền cập nhật Deal này.", 403),
        "conflict": ("Deal đã được người khác cập nhật. Hãy tải lại bảng.", 409),
        "invalid_transition": ("Không thể chuyển Deal từ trạng thái hiện tại sang trạng thái này.", 409),
        "missing_lost_reason": ("Deal LOST cần có lý do thất bại.", 400),
    }
    if result["kind"] in errors:
        message, status = errors[result["kind"]]
        return json_error(message, status)
    return jsonify({
        "id": parsed_id, "stage": result["stage"], "version": result["version"],
        "closedAmount": result["closedAmount"], "closedDate": result["closedDate"],
        "lostReason": result["lostReason"],
    })


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "")
    password = data.get("password", "")
    key_email = email.strip().lower() if isinstance(email, str) else "invalid"
    key = hashlib.sha256(f"{request.remote_addr}:{key_email}".encode()).hexdigest()
    failure_key = f"login-failure:{key}"
    blocked = rate_limit_exceeded(
        failure_key,
        message="Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.",
    )
    if blocked:
        return blocked
    if not isinstance(email, str) or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or not isinstance(password, str) or not password or len(password) > 128:
        return validation_error([("email", "Email hoặc mật khẩu không hợp lệ.")])
    rows = query(
        "SELECT id,name,email,role,status,password_hash FROM users WHERE email=%s",
        (email.strip().lower(),),
    )
    user_row = rows[0] if rows else None
    if (
        not user_row
        or user_row["status"] != "ACTIVE"
        or not bcrypt.checkpw(password.encode(), user_row["password_hash"].encode())
    ):
        rate_limited(
            failure_key,
            limit=5,
            message="Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.",
        )
        return json_error("Email hoặc mật khẩu không chính xác, hoặc tài khoản chưa hoạt động.", 401)
    user = public_user(user_row)
    refresh = secrets.token_urlsafe(48)
    execute(
        "INSERT INTO refresh_tokens (user_id,token_hash,expires_at) VALUES (%s,%s,%s)",
        (user["id"], hash_token(refresh), datetime.now() + timedelta(days=7)),
    )
    response = make_response(jsonify({"user": user}))
    set_auth_cookies(response, user, refresh)
    return response


@app.post("/api/auth/refresh")
def refresh_auth():
    raw = request.cookies.get("nexus_refresh")
    if not raw:
        response = make_response(json_error("Refresh token không hợp lệ hoặc đã hết hạn.", 401))
        clear_auth_cookies(response)
        return response
    rows = query(
        "SELECT id,user_id,expires_at,revoked_at FROM refresh_tokens WHERE token_hash=%s",
        (hash_token(raw),),
    )
    token = rows[0] if rows else None
    if not token:
        response = make_response(json_error("Refresh token không hợp lệ hoặc đã hết hạn.", 401))
        clear_auth_cookies(response)
        return response
    if token["revoked_at"]:
        execute("UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=%s AND revoked_at IS NULL", (token["user_id"],))
        response = make_response(json_error("Refresh token không hợp lệ hoặc đã hết hạn.", 401))
        clear_auth_cookies(response)
        return response
    expiry = token["expires_at"]
    if expiry.tzinfo:
        expiry = expiry.replace(tzinfo=None)
    if expiry <= datetime.now():
        execute("UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=%s", (token["id"],))
        response = make_response(json_error("Refresh token không hợp lệ hoặc đã hết hạn.", 401))
        clear_auth_cookies(response)
        return response
    user = get_user(token["user_id"])
    if not user or user["status"] != "ACTIVE":
        execute("UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=%s AND revoked_at IS NULL", (token["user_id"],))
        response = make_response(json_error("Refresh token không hợp lệ hoặc đã hết hạn.", 401))
        clear_auth_cookies(response)
        return response
    new_token = secrets.token_urlsafe(48)

    def rotate(cursor):
        cursor.execute("UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=%s AND revoked_at IS NULL", (token["id"],))
        if cursor.rowcount != 1:
            return False
        cursor.execute(
            "INSERT INTO refresh_tokens (user_id,token_hash,expires_at) VALUES (%s,%s,%s)",
            (user["id"], hash_token(new_token), datetime.now() + timedelta(days=7)),
        )
        return True

    if not transaction(rotate):
        response = make_response(json_error("Refresh token không hợp lệ hoặc đã hết hạn.", 401))
        clear_auth_cookies(response)
        return response
    response = make_response(jsonify({"user": user}))
    set_auth_cookies(response, user, new_token)
    return response


@app.post("/api/auth/logout")
def logout():
    raw = request.cookies.get("nexus_refresh")
    if raw:
        execute("UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=%s AND revoked_at IS NULL", (hash_token(raw),))
    response = make_response("", 204)
    clear_auth_cookies(response)
    return response


@app.get("/api/auth/me")
@auth_required
def auth_me():
    return jsonify({"user": g.user})


@app.post("/api/auth/forgot-password")
def forgot_password():
    blocked = rate_limited(
        f"forgot:{request.remote_addr}",
        message="Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau.",
    )
    if blocked:
        return blocked
    if NODE_ENV == "production":
        return json_error("Dịch vụ email đặt lại mật khẩu chưa được cấu hình.", 503)
    try:
        data = body_object()
        email = valid_email(data.get("email"), required=True)
    except ValueError as error:
        return validation_error([("email", str(error))])
    rows = query("SELECT id,email FROM users WHERE email=%s", (email,))
    if rows:
        user = rows[0]
        token = secrets.token_hex(32)
        origin = request.host_url.rstrip("/")
        reset_url = f"{origin}/reset-password?token={quote(token)}"

        def save_reset(cursor):
            cursor.execute(
                "UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=%s AND used_at IS NULL",
                (user["id"],),
            )
            cursor.execute(
                "INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES (%s,%s,%s)",
                (user["id"], hash_token(token), datetime.now() + timedelta(minutes=15)),
            )
            cursor.execute(
                "INSERT INTO dev_mailbox (recipient,subject,reset_url) VALUES (%s,%s,%s)",
                (user["email"], "Đặt lại mật khẩu Nexus CRM", reset_url),
            )

        transaction(save_reset)
    return jsonify({"message": "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi."})


@app.post("/api/auth/reset-password")
def reset_password():
    blocked = rate_limited(
        f"reset:{request.remote_addr}",
        message="Bạn đã thử đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau 15 phút.",
    )
    if blocked:
        return blocked
    try:
        data = body_object()
        token = clean_text(data.get("token", ""), "Token", 256, True, 32)
        password = validate_password(data.get("password"))
    except ValueError as error:
        return validation_error([("body", str(error))])
    rows = query(
        "SELECT id,user_id,expires_at,used_at FROM password_reset_tokens WHERE token_hash=%s",
        (hash_token(token),),
    )
    reset = rows[0] if rows else None
    if not reset or reset["used_at"] or reset["expires_at"] <= datetime.now():
        return json_error("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", 400)
    encoded = password_hash(password)

    def apply_reset(cursor):
        cursor.execute(
            "UPDATE password_reset_tokens SET used_at=NOW() WHERE id=%s AND used_at IS NULL AND expires_at>NOW()",
            (reset["id"],),
        )
        if cursor.rowcount != 1:
            return False
        cursor.execute("UPDATE users SET password_hash=%s WHERE id=%s", (encoded, reset["user_id"]))
        cursor.execute(
            "UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=%s AND used_at IS NULL",
            (reset["user_id"],),
        )
        cursor.execute(
            "UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=%s AND revoked_at IS NULL",
            (reset["user_id"],),
        )
        return True

    if not transaction(apply_reset):
        return json_error("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", 400)
    return jsonify({"message": "Mật khẩu đã được cập nhật. Hãy đăng nhập lại."})


@app.get("/api/admin/users")
@roles_required("Admin")
def admin_users():
    users = query(
        "SELECT id,name,email,role,status,created_at AS createdAt FROM users ORDER BY id"
    )
    return jsonify({"users": users})


@app.post("/api/admin/users")
@roles_required("Admin")
def admin_create_user():
    try:
        data = body_object()
        name = clean_text(data.get("name"), "Họ tên", 100, True, 2)
        email = valid_email(data.get("email"), True)
        password = validate_password(data.get("password"))
        role = data.get("role")
        if role not in ("Admin", "Manager", "Sale"):
            raise ValueError("Vai trò không hợp lệ.")
    except ValueError as error:
        return validation_error([("body", str(error))])
    try:
        user_id, _ = execute(
            "INSERT INTO users (name,email,password_hash,role) VALUES (%s,%s,%s,%s)",
            (name, email, password_hash(password), role),
        )
    except IntegrityError as error:
        if error.errno == errorcode.ER_DUP_ENTRY:
            return json_error("Email này đã được sử dụng.", 409)
        raise
    return jsonify({"user": get_user(user_id)}), 201


@app.patch("/api/admin/users/<user_id>")
@roles_required("Admin")
def admin_update_user(user_id):
    try:
        target_id = positive_id(user_id)
        data = body_object()
        if not data or any(key not in ("role", "status") for key in data):
            raise ValueError("Dữ liệu không hợp lệ.")
        if "role" in data and data["role"] not in ("Admin", "Manager", "Sale"):
            raise ValueError("Vai trò không hợp lệ.")
        if "status" in data and data["status"] not in ("ACTIVE", "LOCKED", "INACTIVE"):
            raise ValueError("Trạng thái không hợp lệ.")
    except ValueError as error:
        return validation_error([("body", str(error))])
    if g.user["id"] == target_id and (
        data.get("role", "Admin") != "Admin" or data.get("status", "ACTIVE") != "ACTIVE"
    ):
        return json_error("Không thể tự hạ quyền hoặc khóa tài khoản Admin đang đăng nhập.", 400)
    if not get_user(target_id):
        return json_error("Không tìm thấy người dùng.", 404)
    execute(
        "UPDATE users SET role=COALESCE(%s,role),status=COALESCE(%s,status) WHERE id=%s",
        (data.get("role"), data.get("status"), target_id),
    )
    if data.get("status") and data["status"] != "ACTIVE":
        execute(
            "UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=%s AND revoked_at IS NULL",
            (target_id,),
        )
    return jsonify({"user": get_user(target_id)})


@app.delete("/api/admin/users/<user_id>")
@roles_required("Admin")
def admin_delete_user(user_id):
    try:
        target_id = positive_id(user_id)
    except ValueError as error:
        return json_error(str(error), 400)
    if g.user["id"] == target_id:
        return json_error("Không thể xóa tài khoản Admin đang đăng nhập.", 400)
    _, affected = execute("DELETE FROM users WHERE id=%s", (target_id,))
    if not affected:
        return json_error("Không tìm thấy người dùng.", 404)
    return "", 204


@app.get("/api/dev/mailbox")
def dev_mailbox():
    if NODE_ENV != "development":
        return json_error("Không tìm thấy.", 404)
    messages = query(
        "SELECT id,recipient,subject,reset_url AS resetUrl,created_at AS createdAt "
        "FROM dev_mailbox ORDER BY id DESC LIMIT 20"
    )
    return jsonify({"messages": messages})


@app.delete("/api/dev/mailbox")
def clear_mailbox():
    if NODE_ENV != "development":
        return json_error("Không tìm thấy.", 404)
    execute("DELETE FROM dev_mailbox")
    return "", 204


@app.get("/api/leads")
@auth_required
def leads_list():
    try:
        page = max(1, int(request.args.get("page", "1")))
        limit = min(100, max(1, int(request.args.get("limit", "20"))))
        assigned_to = request.args.get("assigned_to")
        assigned_to = positive_id(assigned_to) if assigned_to else None
    except ValueError:
        return json_error("Tham số truy vấn không hợp lệ.", 400)
    where, values = ["deleted_at IS NULL"], []
    own, own_values = ownership(g.user)
    if own:
        where.append(own)
        values.extend(own_values)
    search = request.args.get("q", "").strip()[:160]
    if search:
        where.append("(name LIKE %s OR phone LIKE %s)")
        values.extend([f"%{search}%", f"%{search}%"])
    status = request.args.get("status")
    if status in ("NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED"):
        where.append("status=%s")
        values.append(status)
    source = request.args.get("source", "").strip()[:80]
    if source:
        where.append("source=%s")
        values.append(source)
    if assigned_to:
        where.append("owner_user_id=%s")
        values.append(assigned_to)
    clause = " WHERE " + " AND ".join(where)
    leads = query(
        "SELECT id,owner_user_id AS ownerUserId,name,company,email,phone,source,status,notes,"
        "created_at AS createdAt,updated_at AS updatedAt FROM leads" + clause
        + " ORDER BY created_at DESC,id DESC LIMIT %s OFFSET %s",
        tuple(values + [limit, (page - 1) * limit]),
    )
    count = query("SELECT COUNT(*) AS total FROM leads" + clause, tuple(values))[0]["total"]
    return jsonify({"leads": leads, "pagination": {"page": page, "limit": limit, "total": count, "totalPages": (count + limit - 1) // limit}})


@app.post("/api/leads")
@auth_required
def leads_create():
    try:
        data = lead_payload(body_object())
    except ValueError as error:
        return validation_error([("body", str(error))])
    duplicate = find_duplicate_lead(data["email"], data["phone"])
    if duplicate:
        return json_error("Lead với email hoặc số điện thoại này đã tồn tại.", 409, duplicate=duplicate)
    try:
        lead_id, _ = execute(
            "INSERT INTO leads (owner_user_id,name,company,email,phone,source,notes,status) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            (g.user["id"], data["name"], data["company"], data["email"], data["phone"], data["source"], data["notes"], data["status"]),
        )
    except IntegrityError as error:
        if error.errno == errorcode.ER_DUP_ENTRY:
            return json_error("Lead với email hoặc số điện thoại này đã tồn tại.", 409)
        raise
    lead = query(
        "SELECT id,owner_user_id AS ownerUserId,name,company,email,phone,source,status,notes,"
        "created_at AS createdAt,updated_at AS updatedAt FROM leads WHERE id=%s",
        (lead_id,),
    )[0]
    return jsonify({"lead": lead}), 201


@app.put("/api/leads/<lead_id>")
@auth_required
def leads_update(lead_id):
    try:
        parsed_id = positive_id(lead_id)
        data = body_object()
        allowed = ("name", "company", "email", "phone", "source", "notes", "status")
        if not data or any(field not in allowed for field in data):
            raise ValueError("Cần cung cấp trường Lead hợp lệ để cập nhật.")
        normalized = {}
        if "name" in data:
            normalized["name"] = clean_text(data["name"], "Họ tên", 160, True, 2)
        if "company" in data:
            normalized["company"] = clean_text(data["company"], "Công ty", 160) or None
        if "email" in data:
            normalized["email"] = valid_email(data["email"])
        if "phone" in data:
            phone = clean_text(data["phone"], "Số điện thoại", 40)
            phone = re.sub(r"[\s().-]", "", phone) or None
            if phone and not re.fullmatch(r"\+?\d{6,20}", phone):
                raise ValueError("Số điện thoại không hợp lệ.")
            normalized["phone"] = phone
        if "source" in data:
            normalized["source"] = clean_text(data["source"], "Nguồn", 80) or None
        if "notes" in data:
            normalized["notes"] = clean_text(data["notes"], "Ghi chú", 5000) or None
        if "status" in data:
            if data["status"] not in ("NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"):
                raise ValueError("Trạng thái Lead không hợp lệ.")
            normalized["status"] = data["status"]
    except ValueError as error:
        return validation_error([("body", str(error))])
    existing_rows = query(
        "SELECT id,email,phone FROM leads WHERE id=%s AND deleted_at IS NULL"
        + (" AND owner_user_id=%s" if g.user["role"] != "Admin" else ""),
        (parsed_id, g.user["id"]) if g.user["role"] != "Admin" else (parsed_id,),
    )
    if not existing_rows:
        return json_error("Không tìm thấy Lead.", 404)
    existing = existing_rows[0]
    email = normalized.get("email", existing["email"])
    phone = normalized.get("phone", existing["phone"])
    if not email and not phone:
        return json_error("Lead cần có ít nhất email hoặc số điện thoại.", 400)
    duplicate = find_duplicate_lead(email, phone, parsed_id)
    if duplicate:
        return json_error("Lead với email hoặc số điện thoại này đã tồn tại.", 409, duplicate=duplicate)
    columns = {"name": "name", "company": "company", "email": "email", "phone": "phone", "source": "source", "notes": "notes", "status": "status"}
    execute(
        "UPDATE leads SET " + ",".join(f"{columns[field]}=%s" for field in normalized) + " WHERE id=%s AND deleted_at IS NULL",
        tuple(list(normalized.values()) + [parsed_id]),
    )
    lead = query(
        "SELECT id,owner_user_id AS ownerUserId,name,company,email,phone,source,status,notes,created_at AS createdAt,updated_at AS updatedAt FROM leads WHERE id=%s",
        (parsed_id,),
    )[0]
    return jsonify({"lead": lead})


@app.delete("/api/leads/<lead_id>")
@auth_required
def leads_delete(lead_id):
    try:
        parsed_id = positive_id(lead_id)
    except ValueError as error:
        return json_error(str(error), 400)
    _, affected = execute(
        "UPDATE leads SET deleted_at=NOW() WHERE id=%s AND deleted_at IS NULL"
        + (" AND owner_user_id=%s" if g.user["role"] != "Admin" else ""),
        (parsed_id, g.user["id"]) if g.user["role"] != "Admin" else (parsed_id,),
    )
    return ("", 204) if affected else json_error("Không tìm thấy Lead.", 404)


@app.patch("/api/leads/<lead_id>/assign")
@roles_required("Admin", "Manager")
def assign_lead(lead_id):
    try:
        parsed_id = positive_id(lead_id)
        sale_id = positive_id(body_object().get("assigned_to"))
    except ValueError as error:
        return json_error(str(error), 400)

    def assign(cursor):
        cursor.execute("SELECT id,name,owner_user_id AS ownerUserId FROM leads WHERE id=%s AND deleted_at IS NULL FOR UPDATE", (parsed_id,))
        lead = cursor.fetchone()
        if not lead:
            return {"kind": "not_found"}
        if g.user["role"] == "Manager" and lead["ownerUserId"] != g.user["id"]:
            return {"kind": "not_found"}
        cursor.execute("SELECT id,name FROM users WHERE id=%s AND role='Sale' AND status='ACTIVE'", (sale_id,))
        sale = cursor.fetchone()
        if not sale:
            return {"kind": "invalid_sale"}
        if lead["ownerUserId"] == sale["id"]:
            return {"kind": "unchanged", "lead": lead, "sale": sale}
        cursor.execute("UPDATE leads SET owner_user_id=%s WHERE id=%s", (sale["id"], lead["id"]))
        cursor.execute(
            "INSERT INTO activities (user_id,lead_id,activity_type,subject,details) VALUES (%s,%s,'OTHER','Lead assigned',%s)",
            (g.user["id"], lead["id"], f"Lead reassigned by {g.user['name']} to {sale['name']} (ID {sale['id']})."),
        )
        return {"kind": "assigned", "lead": lead, "sale": sale}

    result = transaction(assign)
    if result["kind"] == "not_found":
        return json_error("Không tìm thấy Lead.", 404)
    if result["kind"] == "invalid_sale":
        return json_error("Chỉ có thể phân bổ Lead cho nhân viên Sale đang hoạt động.", 400)
    return jsonify({
        "message": "Lead đã được phân bổ cho nhân viên này." if result["kind"] == "unchanged" else "Đã phân bổ Lead cho nhân viên Sale.",
        "lead": {"id": result["lead"]["id"], "name": result["lead"]["name"], "ownerUserId": result["sale"]["id"]},
        "assignedTo": {"id": result["sale"]["id"], "name": result["sale"]["name"]},
        "changed": result["kind"] == "assigned",
    })


@app.get("/api/customers/leads")
@auth_required
def customer_leads():
    page, size, offset, search = page_options()
    filters, values = ["deleted_at IS NULL"], []
    own, own_values = ownership(g.user)
    if own:
        filters.append(own)
        values.extend(own_values)
    if search:
        filters.append("(name LIKE %s OR company LIKE %s OR email LIKE %s OR phone LIKE %s)")
        values.extend([f"%{search}%"] * 4)
    status = request.args.get("status")
    if status in ("NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"):
        filters.append("status=%s")
        values.append(status)
    where = " WHERE " + " AND ".join(filters)
    items = query(
        "SELECT id,name,company,email,phone,source,status,notes,converted_account_id AS accountId,"
        "owner_user_id AS ownerUserId,created_at AS createdAt FROM leads" + where
        + " ORDER BY updated_at DESC,id DESC LIMIT %s OFFSET %s",
        tuple(values + [size, offset]),
    )
    total = query("SELECT COUNT(*) AS total FROM leads" + where, tuple(values))[0]["total"]
    return jsonify({"items": items, "page": page, "pageSize": size, "total": total})


@app.post("/api/customers/leads")
@auth_required
def customer_leads_create():
    try:
        data = lead_payload(body_object())
    except ValueError as error:
        return validation_error([("body", str(error))])
    if find_duplicate_lead(data["email"], data["phone"]):
        return json_error("Đã có khách hàng tiềm năng trùng email hoặc số điện thoại.", 409, code="DUPLICATE_LEAD")
    try:
        lead_id, _ = execute(
            "INSERT INTO leads (owner_user_id,name,company,email,phone,source,notes,status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            (g.user["id"], data["name"], data["company"], data["email"], data["phone"], data["source"], data["notes"], data["status"]),
        )
    except IntegrityError as error:
        if error.errno == errorcode.ER_DUP_ENTRY:
            return json_error("Đã có khách hàng tiềm năng trùng email hoặc số điện thoại.", 409, code="DUPLICATE_LEAD")
        raise
    item = query(
        "SELECT id,name,company,email,phone,source,status,notes,converted_account_id AS accountId,owner_user_id AS ownerUserId,created_at AS createdAt FROM leads WHERE id=%s",
        (lead_id,),
    )[0]
    return jsonify({"item": item}), 201


@app.patch("/api/customers/leads/<lead_id>")
@auth_required
def customer_lead_update(lead_id):
    try:
        parsed_id = positive_id(lead_id)
        data = lead_payload(body_object())
    except ValueError as error:
        return validation_error([("body", str(error))])
    if not can_access_customer(g.user, "leads", parsed_id):
        return json_error("Không tìm thấy khách hàng tiềm năng.", 404)
    if find_duplicate_lead(data["email"], data["phone"], parsed_id):
        return json_error("Đã có khách hàng tiềm năng trùng email hoặc số điện thoại.", 409, code="DUPLICATE_LEAD")
    execute(
        "UPDATE leads SET name=%s,company=%s,email=%s,phone=%s,source=%s,status=%s,notes=%s WHERE id=%s",
        (data["name"], data["company"], data["email"], data["phone"], data["source"], data["status"], data["notes"], parsed_id),
    )
    item = query(
        "SELECT id,name,company,email,phone,source,status,notes,converted_account_id AS accountId,owner_user_id AS ownerUserId,created_at AS createdAt FROM leads WHERE id=%s",
        (parsed_id,),
    )[0]
    return jsonify({"item": item})


@app.post("/api/leads/<lead_id>/convert")
@app.post("/api/customers/leads/<lead_id>/convert")
@auth_required
def convert_lead(lead_id):
    try:
        parsed_id = positive_id(lead_id)
        data = request.get_json(silent=True) or {}
        account_name = clean_text(data.get("accountName", ""), "Tên Account", 160) or None
        if account_name and len(account_name) < 2:
            raise ValueError("Tên Account phải có ít nhất 2 ký tự.")
    except ValueError as error:
        return json_error(str(error), 400)

    def convert(cursor):
        cursor.execute(
            "SELECT id,owner_user_id AS ownerUserId,name,company,email,phone,status,deleted_at AS deletedAt FROM leads WHERE id=%s FOR UPDATE",
            (parsed_id,),
        )
        lead = cursor.fetchone()
        if not lead or (g.user["role"] != "Admin" and lead["ownerUserId"] != g.user["id"]):
            return {"kind": "not_found"}
        if lead["deletedAt"] or lead["status"] == "CONVERTED":
            return {"kind": "already_converted"}
        if lead["status"] != "QUALIFIED":
            return {"kind": "not_qualified"}
        duplicate_values = []
        duplicate_conditions = []
        if lead["email"]:
            duplicate_conditions.append("LOWER(email)=LOWER(%s)")
            duplicate_values.append(lead["email"])
        if lead["phone"]:
            duplicate_conditions.append("phone=%s")
            duplicate_values.append(lead["phone"])
        if duplicate_conditions:
            cursor.execute(
                "SELECT id FROM accounts WHERE " + " OR ".join(duplicate_conditions) + " LIMIT 1",
                tuple(duplicate_values),
            )
            if cursor.fetchone():
                return {"kind": "duplicate_account"}
        name = account_name or lead["company"] or lead["name"]
        cursor.execute(
            "INSERT INTO accounts (owner_user_id,name,email,phone) VALUES (%s,%s,%s,%s)",
            (lead["ownerUserId"], name, lead["email"], lead["phone"]),
        )
        account_id = cursor.lastrowid
        parts = lead["name"].strip().split()
        first_name = parts[0] if len(parts) > 1 else lead["name"].strip()
        last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
        cursor.execute(
            "INSERT INTO contacts (account_id,owner_user_id,first_name,last_name,email,phone) VALUES (%s,%s,%s,%s,%s,%s)",
            (account_id, lead["ownerUserId"], first_name[:80], last_name[:80], lead["email"], lead["phone"]),
        )
        contact_id = cursor.lastrowid
        cursor.execute(
            "UPDATE leads SET status='CONVERTED',converted_account_id=%s,deleted_at=NOW() WHERE id=%s AND status='QUALIFIED' AND deleted_at IS NULL",
            (account_id, parsed_id),
        )
        if cursor.rowcount != 1:
            raise RuntimeError("Qualified lead changed during conversion.")
        cursor.execute(
            "INSERT INTO activities (user_id,lead_id,account_id,contact_id,activity_type,subject,details) "
            "VALUES (%s,%s,%s,%s,'STATUS_CHANGE','Lead converted',%s)",
            (g.user["id"], parsed_id, account_id, contact_id, f"Lead converted to account {name}"),
        )
        return {"kind": "converted", "accountId": account_id, "contactId": contact_id}

    result = transaction(convert)
    if result["kind"] == "not_found":
        return json_error("Không tìm thấy khách hàng tiềm năng.", 404)
    if result["kind"] == "already_converted":
        return json_error("Khách hàng tiềm năng đã được chuyển đổi.", 409)
    if result["kind"] == "not_qualified":
        return json_error("Chỉ có thể chuyển đổi Lead ở trạng thái QUALIFIED.", 409)
    if result["kind"] == "duplicate_account":
        return json_error("Đã tồn tại Account có cùng email hoặc số điện thoại. Hãy kiểm tra và liên kết thủ công trước khi chuyển đổi.", 409, code="DUPLICATE_ACCOUNT")
    return jsonify({"accountId": result["accountId"], "contactId": result["contactId"], "message": "Đã chuyển đổi lead thành khách hàng."}), 201


@app.get("/api/accounts")
@auth_required
def accounts_list():
    return _list_accounts("accounts")


@app.get("/api/customers/accounts")
@auth_required
def customer_accounts_list():
    return _list_accounts("customers")


def _list_accounts(prefix):
    page, size, offset, search = page_options()
    own, values = ownership(g.user)
    filters = [own] if own else []
    if search:
        filters.append("(name LIKE %s OR industry LIKE %s OR email LIKE %s OR phone LIKE %s)")
        values.extend([f"%{search}%"] * 4)
    where = " WHERE " + " AND ".join(filters) if filters else ""
    rows = query(
        "SELECT id,name,industry,website,phone,email,billing_address AS billingAddress,owner_user_id AS ownerUserId,"
        "created_at AS createdAt,updated_at AS updatedAt FROM accounts" + where
        + " ORDER BY updated_at DESC,id DESC LIMIT %s OFFSET %s",
        tuple(values + [size, offset]),
    )
    total = query("SELECT COUNT(*) AS total FROM accounts" + where, tuple(values))[0]["total"]
    return jsonify({"items": rows, "page": page, "pageSize": size, "total": total})


@app.post("/api/accounts")
@auth_required
def accounts_create():
    try:
        data = _account_data(body_object(), create=True)
    except ValueError as error:
        return validation_error([("body", str(error))])
    account_id, _ = execute(
        "INSERT INTO accounts (owner_user_id,name,industry,website,phone,email,billing_address) VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (g.user["id"], data["name"], data["industry"], data["website"], data["phone"], data["email"], data["billingAddress"]),
    )
    return jsonify({"account": _account_by_id(account_id)}), 201


def _account_data(data, create=False):
    allowed = ("name", "industry", "website", "phone", "email", "billingAddress")
    if not create and (not data or any(field not in allowed for field in data)):
        raise ValueError("Cần cung cấp ít nhất một trường để cập nhật.")
    result = {}
    if create or "name" in data:
        result["name"] = clean_text(data.get("name"), "Tên Account", 160, True, 2)
    for field, maximum in (("industry", 100), ("phone", 40), ("billingAddress", 5000)):
        if create or field in data:
            result[field] = clean_text(data.get(field), field, maximum) or None
    if create or "email" in data:
        result["email"] = valid_email(data.get("email", ""))
    if create or "website" in data:
        website = clean_text(data.get("website", ""), "Website", 255) or None
        if website and not re.match(r"^https?://", website):
            raise ValueError("Website phải là URL hợp lệ.")
        result["website"] = website
    return result


def _account_by_id(account_id):
    rows = query(
        "SELECT id,name,industry,website,phone,email,billing_address AS billingAddress,owner_user_id AS ownerUserId,"
        "created_at AS createdAt,updated_at AS updatedAt FROM accounts WHERE id=%s",
        (account_id,),
    )
    return rows[0] if rows else None


@app.get("/api/accounts/<account_id>")
@auth_required
def account_get(account_id):
    try:
        parsed_id = positive_id(account_id)
    except ValueError as error:
        return json_error(str(error), 400)
    own, values = ownership(g.user)
    rows = query(
        "SELECT id,name,industry,website,phone,email,billing_address AS billingAddress,owner_user_id AS ownerUserId,"
        "created_at AS createdAt,updated_at AS updatedAt FROM accounts WHERE id=%s"
        + (f" AND {own}" if own else ""),
        tuple([parsed_id] + values),
    )
    return jsonify({"account": rows[0]}) if rows else json_error("Không tìm thấy Account.", 404)


@app.patch("/api/accounts/<account_id>")
@app.put("/api/accounts/<account_id>")
@auth_required
def account_update(account_id):
    try:
        parsed_id = positive_id(account_id)
        data = _account_data(body_object())
    except ValueError as error:
        return validation_error([("body", str(error))])
    if not can_access_customer(g.user, "accounts", parsed_id):
        return json_error("Không tìm thấy Account.", 404)
    columns = {"name": "name", "industry": "industry", "website": "website", "phone": "phone", "email": "email", "billingAddress": "billing_address"}
    execute(
        "UPDATE accounts SET " + ",".join(f"{columns[key]}=%s" for key in data) + " WHERE id=%s",
        tuple(list(data.values()) + [parsed_id]),
    )
    return jsonify({"account": _account_by_id(parsed_id)})


@app.delete("/api/accounts/<account_id>")
@auth_required
def account_delete(account_id):
    try:
        parsed_id = positive_id(account_id)
    except ValueError as error:
        return json_error(str(error), 400)
    if not can_access_customer(g.user, "accounts", parsed_id):
        return json_error("Không tìm thấy Account.", 404)
    try:
        _, affected = execute("DELETE FROM accounts WHERE id=%s", (parsed_id,))
    except IntegrityError as error:
        if error.errno == errorcode.ER_ROW_IS_REFERENCED_2:
            return json_error("Không thể xóa Account đang được sử dụng bởi dữ liệu khác.", 409)
        raise
    return ("", 204) if affected else json_error("Không tìm thấy Account.", 404)


def _contact_select(where, values, page=None):
    limit = ""
    if page:
        limit = " LIMIT %s OFFSET %s"
        values += [page[1], page[2]]
    return query(
        "SELECT c.id,c.account_id AS accountId,a.name AS accountName,c.first_name AS firstName,"
        "c.last_name AS lastName,c.email,c.phone,c.job_title AS jobTitle,c.owner_user_id AS ownerUserId,"
        "c.created_at AS createdAt,c.updated_at AS updatedAt FROM contacts c "
        "INNER JOIN accounts a ON a.id=c.account_id" + where
        + " ORDER BY c.last_name,c.first_name,c.id" + limit,
        tuple(values),
    )


@app.get("/api/contacts")
@auth_required
def contacts_list():
    return _contacts_list(False)


@app.get("/api/customers/contacts")
@auth_required
def customer_contacts_list():
    return _contacts_list(True)


def _contacts_list(customer_api):
    page, size, offset, search = page_options()
    filters, values = [], []
    account_id = request.args.get("accountId")
    if account_id:
        try:
            filters.append("c.account_id=%s")
            values.append(positive_id(account_id))
        except ValueError as error:
            return json_error(str(error), 400)
    if g.user["role"] != "Admin":
        filters.extend(["c.owner_user_id=%s", "a.owner_user_id=%s"])
        values.extend([g.user["id"], g.user["id"]])
    if search:
        filters.append("(c.first_name LIKE %s OR c.last_name LIKE %s OR c.email LIKE %s OR c.phone LIKE %s OR a.name LIKE %s)")
        values.extend([f"%{search}%"] * 5)
    where = " WHERE " + " AND ".join(filters) if filters else ""
    items = _contact_select(where, list(values), (page, size, offset))
    total = query(
        "SELECT COUNT(*) AS total FROM contacts c INNER JOIN accounts a ON a.id=c.account_id" + where,
        tuple(values),
    )[0]["total"]
    return jsonify({"items": items, "page": page, "pageSize": size, "total": total})


def _contact_data(data, create=False):
    fields = ("accountId", "firstName", "lastName", "email", "phone", "jobTitle")
    if not create and (not data or any(field not in fields for field in data)):
        raise ValueError("Cần cung cấp ít nhất một trường để cập nhật.")
    result = {}
    if create or "accountId" in data:
        result["accountId"] = positive_id(data.get("accountId"))
    if create or "firstName" in data:
        result["firstName"] = clean_text(data.get("firstName"), "Tên", 80, True, 1)
    if create or "lastName" in data:
        result["lastName"] = clean_text(data.get("lastName", ""), "Họ", 80)
    if create or "email" in data:
        result["email"] = valid_email(data.get("email", ""))
    for field, maximum in (("phone", 40), ("jobTitle", 100)):
        if create or field in data:
            result[field] = clean_text(data.get(field), field, maximum) or None
    return result


def _contact_by_id(contact_id):
    rows = _contact_select(" WHERE c.id=%s", [contact_id])
    return rows[0] if rows else None


@app.post("/api/contacts")
@auth_required
def contacts_create():
    try:
        data = _contact_data(body_object(), create=True)
    except ValueError as error:
        return validation_error([("body", str(error))])
    account_rows = query(
        "SELECT id,owner_user_id AS ownerUserId FROM accounts WHERE id=%s"
        + (" AND owner_user_id=%s" if g.user["role"] != "Admin" else ""),
        (data["accountId"], g.user["id"]) if g.user["role"] != "Admin" else (data["accountId"],),
    )
    if not account_rows:
        return json_error("Không tìm thấy Account được liên kết.", 404)
    contact_id, _ = execute(
        "INSERT INTO contacts (account_id,owner_user_id,first_name,last_name,email,phone,job_title) VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (data["accountId"], account_rows[0]["ownerUserId"], data["firstName"], data["lastName"], data["email"], data["phone"], data["jobTitle"]),
    )
    return jsonify({"contact": _contact_by_id(contact_id)}), 201


@app.get("/api/contacts/<contact_id>")
@auth_required
def contact_get(contact_id):
    try:
        parsed_id = positive_id(contact_id)
    except ValueError as error:
        return json_error(str(error), 400)
    if not can_access_customer(g.user, "contacts", parsed_id):
        return json_error("Không tìm thấy Contact.", 404)
    return jsonify({"contact": _contact_by_id(parsed_id)})


@app.patch("/api/contacts/<contact_id>")
@app.put("/api/contacts/<contact_id>")
@auth_required
def contact_update(contact_id):
    try:
        parsed_id = positive_id(contact_id)
        data = _contact_data(body_object())
    except ValueError as error:
        return validation_error([("body", str(error))])
    if not can_access_customer(g.user, "contacts", parsed_id):
        return json_error("Không tìm thấy Contact.", 404)
    owner_id = None
    if "accountId" in data:
        account_rows = query(
            "SELECT id,owner_user_id AS ownerUserId FROM accounts WHERE id=%s"
            + (" AND owner_user_id=%s" if g.user["role"] != "Admin" else ""),
            (data["accountId"], g.user["id"]) if g.user["role"] != "Admin" else (data["accountId"],),
        )
        if not account_rows:
            return json_error("Không tìm thấy Account được liên kết.", 404)
        owner_id = account_rows[0]["ownerUserId"]
    columns = {"accountId": "account_id", "firstName": "first_name", "lastName": "last_name", "email": "email", "phone": "phone", "jobTitle": "job_title"}
    assignments = [f"{columns[key]}=%s" for key in data]
    values = list(data.values())
    if owner_id is not None:
        assignments.append("owner_user_id=%s")
        values.append(owner_id)
    execute("UPDATE contacts SET " + ",".join(assignments) + " WHERE id=%s", tuple(values + [parsed_id]))
    return jsonify({"contact": _contact_by_id(parsed_id)})


@app.delete("/api/contacts/<contact_id>")
@auth_required
def contact_delete(contact_id):
    try:
        parsed_id = positive_id(contact_id)
    except ValueError as error:
        return json_error(str(error), 400)
    if not can_access_customer(g.user, "contacts", parsed_id):
        return json_error("Không tìm thấy Contact.", 404)
    execute("DELETE FROM contacts WHERE id=%s", (parsed_id,))
    return "", 204


@app.get("/api/customers/accounts/<account_id>")
@auth_required
def customer_account_detail(account_id):
    try:
        parsed_id = positive_id(account_id)
    except ValueError as error:
        return json_error("ID khách hàng không hợp lệ.", 400)
    if not can_access_customer(g.user, "accounts", parsed_id):
        return json_error("Không tìm thấy khách hàng.", 404)
    account_rows = query(
        "SELECT a.id,a.name,a.industry,a.website,a.phone,a.email,a.billing_address AS billingAddress,"
        "a.owner_user_id AS ownerUserId,u.name AS ownerName,a.created_at AS createdAt "
        "FROM accounts a INNER JOIN users u ON u.id=a.owner_user_id WHERE a.id=%s",
        (parsed_id,),
    )
    if not account_rows:
        return json_error("Không tìm thấy khách hàng.", 404)
    sale_filter = " AND owner_user_id=%s" if g.user["role"] != "Admin" else ""
    sale_values = (parsed_id, g.user["id"]) if sale_filter else (parsed_id,)
    contacts = query(
        "SELECT id,first_name AS firstName,last_name AS lastName,email,phone,job_title AS jobTitle "
        "FROM contacts WHERE account_id=%s" + sale_filter + " ORDER BY last_name,first_name",
        sale_values,
    )
    deals = query(
        "SELECT id,name,amount,currency,stage,probability,expected_close_date AS expectedCloseDate "
        "FROM deals WHERE account_id=%s" + sale_filter + " ORDER BY updated_at DESC LIMIT 20",
        sale_values,
    )
    activity_filter = " AND user_id=%s" if g.user["role"] != "Admin" else ""
    activity_values = (parsed_id, g.user["id"]) if activity_filter else (parsed_id,)
    activities = query(
        "SELECT id,activity_type AS type,subject,details,occurred_at AS occurredAt FROM activities "
        "WHERE account_id=%s" + activity_filter + " ORDER BY occurred_at DESC LIMIT 30",
        activity_values,
    )
    return jsonify({"account": account_rows[0], "contacts": contacts, "deals": deals, "activities": activities})


@app.get("/styles.css")
def styles():
    return send_from_directory(WEB_DIR / "src", "styles.css", mimetype="text/css")


@app.get("/")
@app.get("/login")
@app.get("/forgot-password")
@app.get("/reset-password")
@app.get("/admin/users")
@app.get("/customers")
@app.get("/customers/accounts/<account_id>")
@app.get("/deals")
@app.get("/workspace")
def web_app(**_kwargs):
    return render_template("index.html")


@app.errorhandler(413)
def request_too_large(_error):
    return json_error("Dữ liệu yêu cầu vượt quá giới hạn.", 413)


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    )
    return response


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return json_error("Không tìm thấy tài nguyên.", 404)
    return render_template("index.html")


@app.errorhandler(Exception)
def internal_error(error):
    if isinstance(error, HTTPException):
        if request.path.startswith("/api/"):
            return json_error(error.description, error.code or 500)
        return error
    app.logger.exception("Unhandled application error", exc_info=error)
    return json_error("Lỗi máy chủ.", 500)


def seed_development_users():
    if NODE_ENV != "development":
        return
    users = (
        ("Nexus Admin", "admin@nexus.local", "Admin123!", "Admin"),
        ("Nexus Manager", "manager@nexus.local", "Manager123!", "Manager"),
        ("Nexus Sale", "sale@nexus.local", "Sale123!", "Sale"),
    )
    for name, email, password, role in users:
        execute(
            "INSERT INTO users (name,email,password_hash,role) VALUES (%s,%s,%s,%s) "
            "ON DUPLICATE KEY UPDATE id=id",
            (name, email, password_hash(password), role),
        )


if __name__ == "__main__":
    seed_development_users()
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "3001")), debug=NODE_ENV == "development")
