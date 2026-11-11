-- Demo fixtures for testing the Deal board and stage API.
-- Run once or repeatedly in MySQL Workbench after schema.mysql.sql.
-- Requires one active user with role = 'Sale'. The script is idempotent.

USE nexus_crm;
START TRANSACTION;

SET @demo_sale_id := (
  SELECT id FROM users
  WHERE role = 'Sale' AND status = 'ACTIVE'
  ORDER BY id
  LIMIT 1
);

INSERT INTO accounts (owner_user_id, name, industry, website, phone, email)
SELECT @demo_sale_id, 'DEMO - Sao Mai Technology', 'Technology', 'https://example.com', '0900000101', 'demo.saomai@example.com'
WHERE @demo_sale_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE owner_user_id = @demo_sale_id AND name = 'DEMO - Sao Mai Technology');

INSERT INTO accounts (owner_user_id, name, industry, website, phone, email)
SELECT @demo_sale_id, 'DEMO - An Phat Trading', 'Trading', 'https://example.org', '0900000102', 'demo.anphat@example.com'
WHERE @demo_sale_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE owner_user_id = @demo_sale_id AND name = 'DEMO - An Phat Trading');

INSERT INTO accounts (owner_user_id, name, industry, website, phone, email)
SELECT @demo_sale_id, 'DEMO - Green Field Services', 'Services', 'https://example.net', '0900000103', 'demo.greenfield@example.com'
WHERE @demo_sale_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE owner_user_id = @demo_sale_id AND name = 'DEMO - Green Field Services');

SET @demo_account_1 := (SELECT id FROM accounts WHERE owner_user_id = @demo_sale_id AND name = 'DEMO - Sao Mai Technology' ORDER BY id LIMIT 1);
SET @demo_account_2 := (SELECT id FROM accounts WHERE owner_user_id = @demo_sale_id AND name = 'DEMO - An Phat Trading' ORDER BY id LIMIT 1);
SET @demo_account_3 := (SELECT id FROM accounts WHERE owner_user_id = @demo_sale_id AND name = 'DEMO - Green Field Services' ORDER BY id LIMIT 1);

INSERT INTO deals (account_id, owner_user_id, name, amount, currency, stage, probability, expected_close_date)
SELECT @demo_account_1, @demo_sale_id, 'DEMO - CRM license', 25000000.00, 'VND', 'PROSPECTING', 20, '2026-12-15'
WHERE @demo_sale_id IS NOT NULL AND @demo_account_1 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM deals WHERE account_id = @demo_account_1 AND name = 'DEMO - CRM license');

INSERT INTO deals (account_id, owner_user_id, name, amount, currency, stage, probability, expected_close_date)
SELECT @demo_account_2, @demo_sale_id, 'DEMO - Inventory system', 48000000.00, 'VND', 'PROPOSAL', 55, '2026-12-20'
WHERE @demo_sale_id IS NOT NULL AND @demo_account_2 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM deals WHERE account_id = @demo_account_2 AND name = 'DEMO - Inventory system');

INSERT INTO deals (account_id, owner_user_id, name, amount, currency, stage, probability, expected_close_date)
SELECT @demo_account_3, @demo_sale_id, 'DEMO - ERP integration (test WON)', 72000000.00, 'VND', 'NEGOTIATION', 75, '2026-12-25'
WHERE @demo_sale_id IS NOT NULL AND @demo_account_3 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM deals WHERE account_id = @demo_account_3 AND name = 'DEMO - ERP integration (test WON)');

INSERT INTO deals (account_id, owner_user_id, name, amount, currency, stage, probability, expected_close_date)
SELECT @demo_account_3, @demo_sale_id, 'DEMO - ERP integration (test LOST)', 64000000.00, 'VND', 'NEGOTIATION', 70, '2026-12-28'
WHERE @demo_sale_id IS NOT NULL AND @demo_account_3 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM deals WHERE account_id = @demo_account_3 AND name = 'DEMO - ERP integration (test LOST)');

INSERT INTO deals (account_id, owner_user_id, name, amount, currency, stage, probability, expected_close_date, closed_amount, closed_date)
SELECT @demo_account_1, @demo_sale_id, 'DEMO - Completed support package', 18000000.00, 'VND', 'WON', 100, '2026-11-01', 17500000.00, '2026-11-01'
WHERE @demo_sale_id IS NOT NULL AND @demo_account_1 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM deals WHERE account_id = @demo_account_1 AND name = 'DEMO - Completed support package');

INSERT INTO deals (account_id, owner_user_id, name, amount, currency, stage, probability, expected_close_date, lost_reason)
SELECT @demo_account_2, @demo_sale_id, 'DEMO - Archived data migration', 12000000.00, 'VND', 'LOST', 0, '2026-10-30', 'Khách hàng hoãn dự án'
WHERE @demo_sale_id IS NOT NULL AND @demo_account_2 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM deals WHERE account_id = @demo_account_2 AND name = 'DEMO - Archived data migration');

INSERT INTO deal_history (deal_id, changed_by_user_id, previous_stage, new_stage, previous_amount, new_amount, note)
SELECT d.id, @demo_sale_id, NULL, d.stage, NULL, d.amount, 'Tạo Deal mẫu để kiểm thử'
FROM deals d
WHERE d.name LIKE 'DEMO - %'
  AND NOT EXISTS (SELECT 1 FROM deal_history h WHERE h.deal_id = d.id);

COMMIT;

SELECT d.id, d.name, d.stage, d.amount, d.currency, d.version, d.expected_close_date AS expectedCloseDate,
       d.owner_user_id AS ownerUserId, a.name AS accountName
FROM deals d
JOIN accounts a ON a.id = d.account_id
WHERE d.name LIKE 'DEMO - %'
ORDER BY d.id;
