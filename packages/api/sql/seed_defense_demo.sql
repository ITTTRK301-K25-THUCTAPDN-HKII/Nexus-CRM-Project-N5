-- Safe, repeatable demo data for a Nexus CRM defense walkthrough.
-- Apply schema.mysql.sql first, then start the app once in development mode so
-- the demo users exist. This script only writes rows prefixed with "DEMO -".

USE nexus_crm;
SET NAMES utf8mb4;
START TRANSACTION;

SET @demo_sale_id := (
  SELECT id FROM users
  WHERE role = 'Sale' AND status = 'ACTIVE'
  ORDER BY id
  LIMIT 1
);

INSERT INTO accounts (owner_user_id, name, industry, website, phone, email)
SELECT @demo_sale_id, 'DEMO - Sao Mai Technology', 'Technology',
       'https://example.com', '0900000601', 'demo.saomai@example.com'
WHERE @demo_sale_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE owner_user_id = @demo_sale_id
                  AND name = 'DEMO - Sao Mai Technology');

INSERT INTO accounts (owner_user_id, name, industry, website, phone, email)
SELECT @demo_sale_id, 'DEMO - An Phat Trading', 'Trading',
       'https://example.org', '0900000602', 'demo.anphat@example.com'
WHERE @demo_sale_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE owner_user_id = @demo_sale_id
                  AND name = 'DEMO - An Phat Trading');

SET @demo_account_1 := (SELECT id FROM accounts WHERE owner_user_id = @demo_sale_id
                        AND name = 'DEMO - Sao Mai Technology' ORDER BY id LIMIT 1);
SET @demo_account_2 := (SELECT id FROM accounts WHERE owner_user_id = @demo_sale_id
                        AND name = 'DEMO - An Phat Trading' ORDER BY id LIMIT 1);

INSERT INTO contacts (account_id, owner_user_id, first_name, last_name, email, phone, job_title)
SELECT @demo_account_1, @demo_sale_id, 'Minh', 'Nguyen',
       'demo.minh@example.com', '0900000611', 'IT Manager'
WHERE @demo_sale_id IS NOT NULL AND @demo_account_1 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM contacts WHERE account_id = @demo_account_1
                  AND email = 'demo.minh@example.com');

INSERT INTO leads (owner_user_id, name, company, email, phone, source, status)
SELECT @demo_sale_id, 'DEMO - Linh Tran', 'DEMO - Sao Mai Technology',
       'demo.linh@example.com', '0900000621', 'Referral', 'QUALIFIED'
WHERE @demo_sale_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM leads WHERE owner_user_id = @demo_sale_id
                  AND email = 'demo.linh@example.com');

INSERT INTO deals (account_id, owner_user_id, name, amount, currency, stage,
                   probability, expected_close_date)
SELECT @demo_account_1, @demo_sale_id, 'DEMO - CRM annual license',
       25000000.00, 'VND', 'PROPOSAL', 60, DATE_ADD(CURRENT_DATE, INTERVAL 21 DAY)
WHERE @demo_sale_id IS NOT NULL AND @demo_account_1 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM deals WHERE account_id = @demo_account_1
                  AND name = 'DEMO - CRM annual license');

INSERT INTO deals (account_id, owner_user_id, name, amount, currency, stage,
                   probability, expected_close_date, closed_amount, closed_date)
SELECT @demo_account_2, @demo_sale_id, 'DEMO - Inventory integration',
       48000000.00, 'VND', 'WON', 100, DATE_SUB(CURRENT_DATE, INTERVAL 5 DAY),
       46500000.00, DATE_SUB(CURRENT_DATE, INTERVAL 5 DAY)
WHERE @demo_sale_id IS NOT NULL AND @demo_account_2 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM deals WHERE account_id = @demo_account_2
                  AND name = 'DEMO - Inventory integration');

INSERT INTO deal_history (deal_id, changed_by_user_id, previous_stage, new_stage,
                          previous_amount, new_amount, note)
SELECT d.id, @demo_sale_id, NULL, d.stage, NULL, d.amount, 'Tạo Deal mẫu phục vụ demo'
FROM deals d
WHERE d.name LIKE 'DEMO - %'
  AND d.owner_user_id = @demo_sale_id
  AND NOT EXISTS (SELECT 1 FROM deal_history h WHERE h.deal_id = d.id);

INSERT INTO products (sku, name, description, unit_price, currency, is_active)
VALUES ('DEMO-CRM-001', 'DEMO - Nexus CRM License',
        'Giấy phép sử dụng CRM cho doanh nghiệp', 12500000.00, 'VND', TRUE)
AS incoming_product
ON DUPLICATE KEY UPDATE name = incoming_product.name;

SET @demo_product_id := (SELECT id FROM products WHERE sku = 'DEMO-CRM-001' LIMIT 1);
SET @demo_deal_id := (SELECT id FROM deals WHERE owner_user_id = @demo_sale_id
                      AND name = 'DEMO - CRM annual license' ORDER BY id LIMIT 1);

INSERT INTO quotes (quote_number, deal_id, account_id, created_by_user_id, status,
                    currency, valid_until, subtotal, discount_amount, vat_rate,
                    tax_amount, grand_total, total_amount)
SELECT 'DEMO-Q-001', @demo_deal_id, @demo_account_1, @demo_sale_id, 'DRAFT',
       'VND', DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY), 25000000.00, 0.00,
       10.00, 2500000.00, 27500000.00, 27500000.00
WHERE @demo_sale_id IS NOT NULL AND @demo_account_1 IS NOT NULL AND @demo_deal_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM quotes WHERE quote_number = 'DEMO-Q-001');

SET @demo_quote_id := (SELECT id FROM quotes WHERE quote_number = 'DEMO-Q-001' LIMIT 1);
INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price,
                         discount_percent, line_total)
SELECT @demo_quote_id, @demo_product_id, 'Nexus CRM License - 2 units',
       2.000, 12500000.00, 0.00, 25000000.00
WHERE @demo_quote_id IS NOT NULL AND @demo_product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM quote_items WHERE quote_id = @demo_quote_id);

INSERT INTO tasks (assigned_to_user_id, created_by_user_id, account_id, deal_id,
                   title, description, status, priority, due_at)
SELECT @demo_sale_id, @demo_sale_id, @demo_account_1, @demo_deal_id,
       'DEMO - Follow up CRM proposal', 'Liên hệ khách hàng để trao đổi báo giá.',
       'OPEN', 'HIGH', DATE_ADD(NOW(), INTERVAL 1 DAY)
WHERE @demo_sale_id IS NOT NULL AND @demo_account_1 IS NOT NULL AND @demo_deal_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tasks WHERE assigned_to_user_id = @demo_sale_id
                  AND title = 'DEMO - Follow up CRM proposal');

INSERT INTO activities (user_id, account_id, deal_id, activity_type, subject, details, occurred_at)
SELECT @demo_sale_id, @demo_account_1, @demo_deal_id, 'CALL',
       'DEMO - Proposal discovery call', 'Khách hàng quan tâm đến quản lý pipeline.', NOW()
WHERE @demo_sale_id IS NOT NULL AND @demo_account_1 IS NOT NULL AND @demo_deal_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM activities WHERE account_id = @demo_account_1
                  AND subject = 'DEMO - Proposal discovery call');

INSERT INTO appointments (organizer_user_id, account_id, deal_id, title, description,
                          location, starts_at, ends_at, status)
SELECT @demo_sale_id, @demo_account_1, @demo_deal_id,
       'DEMO - Proposal review meeting', 'Trao đổi phạm vi và bước triển khai tiếp theo.',
       'Online', DATE_ADD(NOW(), INTERVAL 2 DAY), DATE_ADD(NOW(), INTERVAL 2 DAY) + INTERVAL 1 HOUR,
       'SCHEDULED'
WHERE @demo_sale_id IS NOT NULL AND @demo_account_1 IS NOT NULL AND @demo_deal_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM appointments WHERE organizer_user_id = @demo_sale_id
                  AND title = 'DEMO - Proposal review meeting');

COMMIT;

SELECT 'Demo rows use the DEMO - prefix. If no active Sale user exists, start the app once in development mode.' AS result;
SELECT a.name AS account, d.name AS deal, d.stage, d.amount, d.currency
FROM deals d
JOIN accounts a ON a.id = d.account_id
WHERE d.owner_user_id = @demo_sale_id AND d.name LIKE 'DEMO - %'
ORDER BY d.id;
