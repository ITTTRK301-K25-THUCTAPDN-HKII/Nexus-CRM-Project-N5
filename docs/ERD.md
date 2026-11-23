# Nexus CRM - Entity Relationship Diagram

Sơ đồ dưới đây được lập từ schema MySQL hiện tại trong
[`packages/api/sql/schema.mysql.sql`](../packages/api/sql/schema.mysql.sql).
Sơ đồ bao gồm 20 bảng và các quan hệ khóa ngoại được khai báo trong schema.
Các thuộc tính trong từng bảng tập trung vào khóa chính, khóa ngoại và thông
tin nghiệp vụ chính để sơ đồ dễ đọc; schema SQL là nguồn đầy đủ và chính xác
cho tất cả kiểu dữ liệu, ràng buộc và chỉ mục.

```mermaid
erDiagram
    roles ||--o{ users : "role"
    users ||--o{ refresh_tokens : "user_id"
    users ||--o{ accounts : "owner_user_id"
    users ||--o{ leads : "owner_user_id"
    accounts o|--o{ leads : "converted_account_id"
    accounts ||--o{ contacts : "account_id"
    users ||--o{ contacts : "owner_user_id"
    accounts ||--o{ deals : "account_id"
    contacts o|--o{ deals : "contact_id"
    users ||--o{ deals : "owner_user_id"
    deals ||--o{ deal_history : "deal_id"
    users o|--o{ deal_history : "changed_by_user_id"
    deals ||--o{ quotes : "deal_id"
    accounts ||--o{ quotes : "account_id"
    users ||--o{ quotes : "created_by_user_id"
    users o|--o{ quotes : "approval_decided_by_user_id"
    quotes o|--o{ quotes : "version_group_id"
    quotes o|--o{ quotes : "previous_version_id"
    quotes ||--o{ quote_items : "quote_id"
    products o|--o{ quote_items : "product_id"
    quotes ||--o{ quote_history : "quote_id"
    users o|--o{ quote_history : "actor_user_id"
    users ||--o{ tasks : "assigned_to_user_id"
    users o|--o{ tasks : "created_by_user_id"
    leads o|--o{ tasks : "lead_id"
    accounts o|--o{ tasks : "account_id"
    contacts o|--o{ tasks : "contact_id"
    deals o|--o{ tasks : "deal_id"
    users ||--o{ appointment_series : "organizer_user_id"
    leads o|--o{ appointment_series : "lead_id"
    accounts o|--o{ appointment_series : "account_id"
    contacts o|--o{ appointment_series : "contact_id"
    deals o|--o{ appointment_series : "deal_id"
    users ||--o{ appointments : "organizer_user_id"
    appointment_series o|--o{ appointments : "recurrence_series_id"
    leads o|--o{ appointments : "lead_id"
    accounts o|--o{ appointments : "account_id"
    contacts o|--o{ appointments : "contact_id"
    deals o|--o{ appointments : "deal_id"
    users o|--o{ activities : "user_id"
    leads o|--o{ activities : "lead_id"
    accounts o|--o{ activities : "account_id"
    contacts o|--o{ activities : "contact_id"
    deals o|--o{ activities : "deal_id"
    users ||--o{ notifications : "user_id"
    users o|--o{ audit_logs : "user_id"
    users ||--o{ password_reset_tokens : "user_id"

    roles {
        BIGINT id PK
        VARCHAR name UK
        VARCHAR description
    }

    users {
        BIGINT id PK
        VARCHAR role FK
        VARCHAR name
        VARCHAR email UK
        VARCHAR telegram_chat_id
        VARCHAR status
    }

    refresh_tokens {
        BIGINT id PK
        BIGINT user_id FK
        CHAR token_hash UK
        DATETIME expires_at
        DATETIME revoked_at
    }

    accounts {
        BIGINT id PK
        BIGINT owner_user_id FK
        VARCHAR name
        VARCHAR phone
        VARCHAR email
    }

    leads {
        BIGINT id PK
        BIGINT owner_user_id FK
        BIGINT converted_account_id FK
        VARCHAR name
        VARCHAR email
        VARCHAR phone
        VARCHAR status
        TIMESTAMP deleted_at
    }

    contacts {
        BIGINT id PK
        BIGINT account_id FK
        BIGINT owner_user_id FK
        VARCHAR first_name
        VARCHAR last_name
        VARCHAR email
        VARCHAR phone
    }

    deals {
        BIGINT id PK
        BIGINT account_id FK
        BIGINT contact_id FK
        BIGINT owner_user_id FK
        VARCHAR name
        DECIMAL amount
        CHAR currency
        VARCHAR stage
        TINYINT probability
        INT version
    }

    deal_history {
        BIGINT id PK
        BIGINT deal_id FK
        BIGINT changed_by_user_id FK
        VARCHAR previous_stage
        VARCHAR new_stage
        DECIMAL previous_amount
        DECIMAL new_amount
        TIMESTAMP changed_at
    }

    products {
        BIGINT id PK
        VARCHAR sku UK
        VARCHAR name
        DECIMAL unit_price
        CHAR currency
        BOOLEAN is_active
    }

    quotes {
        BIGINT id PK
        VARCHAR quote_number UK
        INT version
        BIGINT version_group_id FK
        BIGINT previous_version_id FK
        BIGINT deal_id FK
        BIGINT account_id FK
        BIGINT created_by_user_id FK
        BIGINT approval_decided_by_user_id FK
        VARCHAR status
        VARCHAR approval_status
        DECIMAL grand_total
        CHAR currency
    }

    quote_items {
        BIGINT id PK
        BIGINT quote_id FK
        BIGINT product_id FK
        VARCHAR description
        DECIMAL quantity
        DECIMAL unit_price
        DECIMAL line_total
    }

    quote_history {
        BIGINT id PK
        BIGINT quote_id FK
        BIGINT actor_user_id FK
        VARCHAR event_type
        VARCHAR previous_value
        VARCHAR new_value
        TIMESTAMP created_at
    }

    tasks {
        BIGINT id PK
        BIGINT assigned_to_user_id FK
        BIGINT created_by_user_id FK
        BIGINT lead_id FK
        BIGINT account_id FK
        BIGINT contact_id FK
        BIGINT deal_id FK
        VARCHAR title
        VARCHAR status
        VARCHAR priority
        DATETIME due_at
    }

    appointment_series {
        BIGINT id PK
        BIGINT organizer_user_id FK
        BIGINT lead_id FK
        BIGINT account_id FK
        BIGINT contact_id FK
        BIGINT deal_id FK
        VARCHAR title
        DATETIME starts_at
        DATETIME ends_at
        VARCHAR recurrence_frequency
        DATETIME next_starts_at
        BOOLEAN is_active
    }

    appointments {
        BIGINT id PK
        BIGINT organizer_user_id FK
        BIGINT recurrence_series_id FK
        BIGINT lead_id FK
        BIGINT account_id FK
        BIGINT contact_id FK
        BIGINT deal_id FK
        VARCHAR title
        DATETIME starts_at
        DATETIME ends_at
        VARCHAR status
    }

    activities {
        BIGINT id PK
        BIGINT user_id FK
        BIGINT lead_id FK
        BIGINT account_id FK
        BIGINT contact_id FK
        BIGINT deal_id FK
        VARCHAR activity_type
        VARCHAR subject
        DATETIME occurred_at
    }

    notifications {
        BIGINT id PK
        BIGINT user_id FK
        VARCHAR title
        DATETIME read_at
        TIMESTAMP created_at
    }

    audit_logs {
        BIGINT id PK
        BIGINT user_id FK
        VARCHAR action
        VARCHAR entity_type
        BIGINT entity_id
        JSON before_data
        JSON after_data
        TIMESTAMP created_at
    }

    password_reset_tokens {
        BIGINT id PK
        BIGINT user_id FK
        CHAR token_hash UK
        DATETIME expires_at
        DATETIME used_at
    }

    dev_mailbox {
        BIGINT id PK
        VARCHAR recipient
        VARCHAR subject
        VARCHAR reset_url
        TIMESTAMP created_at
    }
```

## Ghi chú

- `PK`: khóa chính; `FK`: khóa ngoại; `UK`: khóa duy nhất.
- `o|` biểu thị quan hệ có thể không có bản ghi liên quan; `||` biểu thị bắt
  buộc có đúng một bản ghi cha; `o{` biểu thị không hoặc nhiều bản ghi con.
- `audit_logs.entity_type` và `entity_id` là tham chiếu đa hình, không phải
  khóa ngoại SQL.
- `dev_mailbox` là bảng hộp thư phát triển, không có khóa ngoại.
- Để cập nhật sơ đồ sau khi đổi CSDL, hãy đối chiếu lại với
  `packages/api/sql/schema.mysql.sql` và các migration đã áp dụng.

## Xuất sơ đồ để đưa vào báo cáo

GitHub hiển thị sơ đồ Mermaid ngay trong tệp này. Để xuất ảnh, sao chép phần
nằm giữa dấu ```mermaid và dấu ``` cuối khối vào Mermaid Live Editor
(<https://mermaid.live/>), sau đó chọn **Actions → PNG**, **SVG** hoặc **PDF**.
