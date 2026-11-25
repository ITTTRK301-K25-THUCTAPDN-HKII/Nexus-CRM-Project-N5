-- Demo showcase fixtures for Nexus CRM.
-- Run after schema.mysql.sql and all migrations in MySQL Workbench.
-- Safe to run repeatedly: creates rows with the "DEMO SHOWCASE -" prefix only.
-- Requires one active Sale user. The fixtures are assigned to that user so they
-- are visible to that Sale, Managers, and Admins under the application's scopes.

USE nexus_crm;
START TRANSACTION;

SET @demo_sale_id := (
  SELECT id FROM users
  WHERE role='Sale' AND status='ACTIVE'
  ORDER BY id
  LIMIT 1
);

-- Accounts
INSERT INTO accounts (owner_user_id,name,industry,website,phone,email,billing_address)
SELECT @demo_sale_id,'DEMO SHOWCASE - Sao Mai Technology','Technology','https://example.com',
       '0900000201','showcase.saomai@example.com','Quận 1, TP. Hồ Chí Minh'
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM accounts WHERE owner_user_id=@demo_sale_id AND name='DEMO SHOWCASE - Sao Mai Technology'
);
INSERT INTO accounts (owner_user_id,name,industry,website,phone,email,billing_address)
SELECT @demo_sale_id,'DEMO SHOWCASE - An Phat Trading','Trading','https://example.org',
       '0900000202','showcase.anphat@example.com','Quận Hải Châu, Đà Nẵng'
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM accounts WHERE owner_user_id=@demo_sale_id AND name='DEMO SHOWCASE - An Phat Trading'
);
INSERT INTO accounts (owner_user_id,name,industry,website,phone,email,billing_address)
SELECT @demo_sale_id,'DEMO SHOWCASE - Green Field Services','Services','https://example.net',
       '0900000203','showcase.greenfield@example.com','Quận 3, TP. Hồ Chí Minh'
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM accounts WHERE owner_user_id=@demo_sale_id AND name='DEMO SHOWCASE - Green Field Services'
);

SET @demo_account_1 := (SELECT id FROM accounts WHERE owner_user_id=@demo_sale_id AND name='DEMO SHOWCASE - Sao Mai Technology' ORDER BY id LIMIT 1);
SET @demo_account_2 := (SELECT id FROM accounts WHERE owner_user_id=@demo_sale_id AND name='DEMO SHOWCASE - An Phat Trading' ORDER BY id LIMIT 1);
SET @demo_account_3 := (SELECT id FROM accounts WHERE owner_user_id=@demo_sale_id AND name='DEMO SHOWCASE - Green Field Services' ORDER BY id LIMIT 1);

-- Contacts
INSERT INTO contacts (account_id,owner_user_id,first_name,last_name,email,phone,job_title)
SELECT @demo_account_1,@demo_sale_id,'Minh','Phát','showcase.phat@example.com','0900000211','Giám đốc kinh doanh'
WHERE @demo_account_1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts WHERE owner_user_id=@demo_sale_id AND email='showcase.phat@example.com');
INSERT INTO contacts (account_id,owner_user_id,first_name,last_name,email,phone,job_title)
SELECT @demo_account_2,@demo_sale_id,'Ngọc','Linh','showcase.linh@example.com','0900000212','Trưởng phòng mua hàng'
WHERE @demo_account_2 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts WHERE owner_user_id=@demo_sale_id AND email='showcase.linh@example.com');
INSERT INTO contacts (account_id,owner_user_id,first_name,last_name,email,phone,job_title)
SELECT @demo_account_3,@demo_sale_id,'Hoàng','Nam','showcase.nam@example.com','0900000213','Quản lý dự án'
WHERE @demo_account_3 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts WHERE owner_user_id=@demo_sale_id AND email='showcase.nam@example.com');

SET @demo_contact_1 := (SELECT id FROM contacts WHERE owner_user_id=@demo_sale_id AND email='showcase.phat@example.com' ORDER BY id LIMIT 1);
SET @demo_contact_2 := (SELECT id FROM contacts WHERE owner_user_id=@demo_sale_id AND email='showcase.linh@example.com' ORDER BY id LIMIT 1);
SET @demo_contact_3 := (SELECT id FROM contacts WHERE owner_user_id=@demo_sale_id AND email='showcase.nam@example.com' ORDER BY id LIMIT 1);

-- Leads in different statuses (kept unconverted for conversion demo).
INSERT INTO leads (owner_user_id,name,company,email,phone,source,status,notes)
SELECT @demo_sale_id,'DEMO SHOWCASE - Trần Thu Hà','Hà Thành Retail','showcase.ha@example.com','0900000221','Website','NEW','Quan tâm giải pháp quản lý bán hàng.'
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads WHERE email='showcase.ha@example.com');
INSERT INTO leads (owner_user_id,name,company,email,phone,source,status,notes)
SELECT @demo_sale_id,'DEMO SHOWCASE - Lê Quốc Bảo','Bảo Minh Logistics','showcase.bao@example.com','0900000222','Referral','CONTACTED','Đã trao đổi lần đầu, cần gửi tài liệu giới thiệu.'
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads WHERE email='showcase.bao@example.com');
INSERT INTO leads (owner_user_id,name,company,email,phone,source,status,notes)
SELECT @demo_sale_id,'DEMO SHOWCASE - Phạm Gia An','Gia An Manufacturing','showcase.giaan@example.com','0900000223','Event','QUALIFIED','Có nhu cầu CRM cho đội ngũ 25 nhân viên.'
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads WHERE email='showcase.giaan@example.com');
SET @demo_lead_1 := (SELECT id FROM leads WHERE email='showcase.ha@example.com' ORDER BY id LIMIT 1);
SET @demo_lead_2 := (SELECT id FROM leads WHERE email='showcase.bao@example.com' ORDER BY id LIMIT 1);

-- Products in both currencies for quote creation and PDF preview.
INSERT INTO products (sku,name,description,unit_price,currency,is_active)
SELECT 'DEMO-SHOWCASE-CRM','Nexus CRM Business','Giấy phép sử dụng Nexus CRM Business',5000000,'VND',TRUE
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products WHERE sku='DEMO-SHOWCASE-CRM');
INSERT INTO products (sku,name,description,unit_price,currency,is_active)
SELECT 'DEMO-SHOWCASE-SETUP','Dịch vụ triển khai CRM','Cấu hình và hướng dẫn vận hành',2500000,'VND',TRUE
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products WHERE sku='DEMO-SHOWCASE-SETUP');
INSERT INTO products (sku,name,description,unit_price,currency,is_active)
SELECT 'DEMO-SHOWCASE-SUPPORT','Gói hỗ trợ 12 tháng','Hỗ trợ kỹ thuật trong 12 tháng',12000000,'VND',TRUE
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products WHERE sku='DEMO-SHOWCASE-SUPPORT');
INSERT INTO products (sku,name,description,unit_price,currency,is_active)
SELECT 'DEMO-SHOWCASE-USD-LICENSE','Nexus CRM USD License','Annual subscription for the USD demo deal',1000,'USD',TRUE
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products WHERE sku='DEMO-SHOWCASE-USD-LICENSE');
SET @demo_product_vnd := (SELECT id FROM products WHERE sku='DEMO-SHOWCASE-CRM' LIMIT 1);
SET @demo_product_usd := (SELECT id FROM products WHERE sku='DEMO-SHOWCASE-USD-LICENSE' LIMIT 1);

-- Deals cover all Kanban stages, both currencies, and current-month revenue.
INSERT INTO deals (account_id,contact_id,owner_user_id,name,amount,currency,stage,probability,expected_close_date)
SELECT @demo_account_1,@demo_contact_1,@demo_sale_id,'DEMO SHOWCASE - CRM prospect',25000000,'VND','PROSPECTING',20,DATE_ADD(CURDATE(),INTERVAL 20 DAY)
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM deals WHERE name='DEMO SHOWCASE - CRM prospect');
INSERT INTO deals (account_id,contact_id,owner_user_id,name,amount,currency,stage,probability,expected_close_date)
SELECT @demo_account_1,@demo_contact_1,@demo_sale_id,'DEMO SHOWCASE - CRM qualification',42000000,'VND','QUALIFICATION',35,DATE_ADD(CURDATE(),INTERVAL 25 DAY)
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM deals WHERE name='DEMO SHOWCASE - CRM qualification');
INSERT INTO deals (account_id,contact_id,owner_user_id,name,amount,currency,stage,probability,expected_close_date)
SELECT @demo_account_2,@demo_contact_2,@demo_sale_id,'DEMO SHOWCASE - Inventory proposal',68000000,'VND','PROPOSAL',60,DATE_ADD(CURDATE(),INTERVAL 30 DAY)
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM deals WHERE name='DEMO SHOWCASE - Inventory proposal');
INSERT INTO deals (account_id,contact_id,owner_user_id,name,amount,currency,stage,probability,expected_close_date)
SELECT @demo_account_3,@demo_contact_3,@demo_sale_id,'DEMO SHOWCASE - ERP negotiation',85000000,'VND','NEGOTIATION',80,DATE_ADD(CURDATE(),INTERVAL 35 DAY)
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM deals WHERE name='DEMO SHOWCASE - ERP negotiation');
INSERT INTO deals (account_id,contact_id,owner_user_id,name,amount,currency,stage,probability,expected_close_date,closed_amount,closed_date)
SELECT @demo_account_1,@demo_contact_1,@demo_sale_id,'DEMO SHOWCASE - Won VND revenue',72000000,'VND','WON',100,CURDATE(),70000000,CURDATE()
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM deals WHERE name='DEMO SHOWCASE - Won VND revenue');
INSERT INTO deals (account_id,contact_id,owner_user_id,name,amount,currency,stage,probability,expected_close_date,closed_amount,closed_date)
SELECT @demo_account_2,@demo_contact_2,@demo_sale_id,'DEMO SHOWCASE - Won USD revenue',1800,'USD','WON',100,CURDATE(),1750,CURDATE()
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM deals WHERE name='DEMO SHOWCASE - Won USD revenue');
INSERT INTO deals (account_id,contact_id,owner_user_id,name,amount,currency,stage,probability,expected_close_date,lost_reason)
SELECT @demo_account_3,@demo_contact_3,@demo_sale_id,'DEMO SHOWCASE - Lost service deal',32000000,'VND','LOST',0,CURDATE(),'Khách hàng chọn giải pháp khác.'
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM deals WHERE name='DEMO SHOWCASE - Lost service deal');

SET @demo_deal_proposal := (SELECT id FROM deals WHERE name='DEMO SHOWCASE - Inventory proposal' ORDER BY id LIMIT 1);
SET @demo_deal_usd := (SELECT id FROM deals WHERE name='DEMO SHOWCASE - Won USD revenue' ORDER BY id LIMIT 1);
SET @demo_deal_won_vnd := (SELECT id FROM deals WHERE name='DEMO SHOWCASE - Won VND revenue' ORDER BY id LIMIT 1);
INSERT INTO deal_history (deal_id,changed_by_user_id,previous_stage,new_stage,previous_amount,new_amount,note)
SELECT d.id,@demo_sale_id,NULL,d.stage,NULL,COALESCE(d.closed_amount,d.amount),'Demo: trạng thái ban đầu'
FROM deals d WHERE d.name LIKE 'DEMO SHOWCASE -%'
  AND NOT EXISTS (SELECT 1 FROM deal_history h WHERE h.deal_id=d.id);

-- A draft VND quote that can be submitted for approval from the UI.
INSERT INTO quotes (quote_number,deal_id,account_id,created_by_user_id,status,approval_status,currency,valid_until,
                    subtotal,discount_amount,vat_rate,tax_amount,grand_total,total_amount)
SELECT 'Q-DEMO-SHOWCASE-VND',@demo_deal_proposal,@demo_account_2,@demo_sale_id,'DRAFT','NOT_REQUESTED','VND',DATE_ADD(CURDATE(),INTERVAL 14 DAY),
       10000000,500000,10,950000,10450000,10450000
WHERE @demo_sale_id IS NOT NULL AND @demo_deal_proposal IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM quotes WHERE quote_number='Q-DEMO-SHOWCASE-VND');
SET @demo_quote_vnd := (SELECT id FROM quotes WHERE quote_number='Q-DEMO-SHOWCASE-VND' LIMIT 1);
UPDATE quotes SET version_group_id=id WHERE id=@demo_quote_vnd AND version_group_id IS NULL;
INSERT INTO quote_items (quote_id,product_id,description,quantity,unit_price,discount_percent,line_total)
SELECT @demo_quote_vnd,@demo_product_vnd,'Nexus CRM Business',2,5000000,5,9500000
WHERE @demo_quote_vnd IS NOT NULL AND NOT EXISTS (SELECT 1 FROM quote_items WHERE quote_id=@demo_quote_vnd);

-- A pending USD quote lets a Manager/Admin demonstrate the approval action.
INSERT INTO quotes (quote_number,deal_id,account_id,created_by_user_id,status,approval_status,approval_requested_at,currency,valid_until,
                    subtotal,discount_amount,vat_rate,tax_amount,grand_total,total_amount)
SELECT 'Q-DEMO-SHOWCASE-USD',@demo_deal_usd,@demo_account_2,@demo_sale_id,'DRAFT','PENDING',NOW(),'USD',DATE_ADD(CURDATE(),INTERVAL 14 DAY),
       1000,0,10,100,1100,1100
WHERE @demo_sale_id IS NOT NULL AND @demo_deal_usd IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM quotes WHERE quote_number='Q-DEMO-SHOWCASE-USD');
SET @demo_quote_usd := (SELECT id FROM quotes WHERE quote_number='Q-DEMO-SHOWCASE-USD' LIMIT 1);
UPDATE quotes SET version_group_id=id WHERE id=@demo_quote_usd AND version_group_id IS NULL;
INSERT INTO quote_items (quote_id,product_id,description,quantity,unit_price,discount_percent,line_total)
SELECT @demo_quote_usd,@demo_product_usd,'Nexus CRM USD License',1,1000,0,1000
WHERE @demo_quote_usd IS NOT NULL AND NOT EXISTS (SELECT 1 FROM quote_items WHERE quote_id=@demo_quote_usd);
INSERT INTO quote_history (quote_id,actor_user_id,event_type,new_value,note)
SELECT @demo_quote_usd,@demo_sale_id,'APPROVAL_REQUESTED','PENDING','Demo: chờ Manager/Admin duyệt'
WHERE @demo_quote_usd IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM quote_history WHERE quote_id=@demo_quote_usd AND event_type='APPROVAL_REQUESTED'
);

-- Open, in-progress, and completed tasks. The open reminder is not due today.
INSERT INTO tasks (assigned_to_user_id,created_by_user_id,account_id,deal_id,title,description,status,priority,due_at)
SELECT @demo_sale_id,@demo_sale_id,@demo_account_1,@demo_deal_proposal,'DEMO SHOWCASE - Gọi tư vấn Sao Mai','Xác nhận nhu cầu CRM và lịch demo.', 'OPEN','HIGH',DATE_ADD(NOW(),INTERVAL 2 DAY)
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tasks WHERE assigned_to_user_id=@demo_sale_id AND title='DEMO SHOWCASE - Gọi tư vấn Sao Mai');
INSERT INTO tasks (assigned_to_user_id,created_by_user_id,account_id,deal_id,title,description,status,priority,due_at)
SELECT @demo_sale_id,@demo_sale_id,@demo_account_3,@demo_deal_won_vnd,'DEMO SHOWCASE - Chuẩn bị biên bản nghiệm thu','Chuẩn bị nội dung nghiệm thu sau khi chốt.', 'IN_PROGRESS','MEDIUM',DATE_ADD(NOW(),INTERVAL 3 DAY)
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tasks WHERE assigned_to_user_id=@demo_sale_id AND title='DEMO SHOWCASE - Chuẩn bị biên bản nghiệm thu');
INSERT INTO tasks (assigned_to_user_id,created_by_user_id,account_id,title,description,status,priority,due_at,completed_at)
SELECT @demo_sale_id,@demo_sale_id,@demo_account_2,'DEMO SHOWCASE - Gửi hồ sơ giới thiệu','Đã gửi hồ sơ giới thiệu sản phẩm.', 'COMPLETED','LOW',DATE_SUB(NOW(),INTERVAL 1 DAY),NOW()
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tasks WHERE assigned_to_user_id=@demo_sale_id AND title='DEMO SHOWCASE - Gửi hồ sơ giới thiệu');

-- Calendar examples: an upcoming meeting, a second scheduled call, and one completed meeting.
INSERT INTO appointments (organizer_user_id,account_id,contact_id,deal_id,title,description,location,starts_at,ends_at,status)
SELECT @demo_sale_id,@demo_account_1,@demo_contact_1,@demo_deal_proposal,'DEMO SHOWCASE - Demo CRM Sao Mai','Giới thiệu quy trình quản lý khách hàng và pipeline.','Phòng họp trực tuyến',
       TIMESTAMP(DATE_ADD(CURDATE(),INTERVAL 1 DAY),'10:00:00'),TIMESTAMP(DATE_ADD(CURDATE(),INTERVAL 1 DAY),'10:45:00'),'SCHEDULED'
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appointments WHERE organizer_user_id=@demo_sale_id AND title='DEMO SHOWCASE - Demo CRM Sao Mai');
INSERT INTO appointments (organizer_user_id,account_id,contact_id,deal_id,title,description,location,starts_at,ends_at,status)
SELECT @demo_sale_id,@demo_account_2,@demo_contact_2,@demo_deal_proposal,'DEMO SHOWCASE - Trao đổi báo giá An Phát','Trao đổi phạm vi và điều khoản báo giá.','Google Meet',
       TIMESTAMP(DATE_ADD(CURDATE(),INTERVAL 2 DAY),'14:00:00'),TIMESTAMP(DATE_ADD(CURDATE(),INTERVAL 2 DAY),'14:30:00'),'SCHEDULED'
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appointments WHERE organizer_user_id=@demo_sale_id AND title='DEMO SHOWCASE - Trao đổi báo giá An Phát');
INSERT INTO appointments (organizer_user_id,account_id,title,description,location,starts_at,ends_at,status)
SELECT @demo_sale_id,@demo_account_3,'DEMO SHOWCASE - Họp khảo sát Green Field','Đã hoàn tất buổi khảo sát nhu cầu.','Văn phòng khách hàng',
       TIMESTAMP(DATE_SUB(CURDATE(),INTERVAL 1 DAY),'09:00:00'),TIMESTAMP(DATE_SUB(CURDATE(),INTERVAL 1 DAY),'09:30:00'),'COMPLETED'
WHERE @demo_sale_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appointments WHERE organizer_user_id=@demo_sale_id AND title='DEMO SHOWCASE - Họp khảo sát Green Field');

-- Activity history for Lead/Account timelines.
INSERT INTO activities (user_id,lead_id,activity_type,subject,details,occurred_at)
SELECT @demo_sale_id,@demo_lead_1,'CALL','DEMO SHOWCASE - Gọi Lead Thu Hà','Lead muốn tìm hiểu giải pháp CRM cho cửa hàng.',DATE_SUB(NOW(),INTERVAL 2 HOUR)
WHERE @demo_sale_id IS NOT NULL AND @demo_lead_1 IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM activities WHERE lead_id=@demo_lead_1 AND subject='DEMO SHOWCASE - Gọi Lead Thu Hà'
);
INSERT INTO activities (user_id,account_id,contact_id,activity_type,subject,details,occurred_at)
SELECT @demo_sale_id,@demo_account_1,@demo_contact_1,'EMAIL','DEMO SHOWCASE - Gửi tài liệu Sao Mai','Đã gửi brochure và lịch trình demo sản phẩm.',DATE_SUB(NOW(),INTERVAL 1 DAY)
WHERE @demo_sale_id IS NOT NULL AND @demo_account_1 IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM activities WHERE account_id=@demo_account_1 AND subject='DEMO SHOWCASE - Gửi tài liệu Sao Mai'
);
INSERT INTO activities (user_id,account_id,contact_id,deal_id,activity_type,subject,details,occurred_at)
SELECT @demo_sale_id,@demo_account_2,@demo_contact_2,@demo_deal_proposal,'MEETING','DEMO SHOWCASE - Họp xác nhận báo giá','Thống nhất phạm vi triển khai và thời hạn báo giá.',NOW()
WHERE @demo_sale_id IS NOT NULL AND @demo_account_2 IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM activities WHERE deal_id=@demo_deal_proposal AND subject='DEMO SHOWCASE - Họp xác nhận báo giá'
);

COMMIT;

-- Result summary. If the first row reports no active Sale, create/activate a Sale user and rerun.
SELECT IF(@demo_sale_id IS NULL,'ERROR: no active Sale user, no fixtures were inserted','OK: demo fixtures are assigned to an active Sale') AS seed_status;
SELECT 'Accounts' AS section,COUNT(*) AS rows_created FROM accounts WHERE name LIKE 'DEMO SHOWCASE -%'
UNION ALL SELECT 'Contacts',COUNT(*) FROM contacts WHERE email LIKE 'showcase.%@example.com'
UNION ALL SELECT 'Leads',COUNT(*) FROM leads WHERE email LIKE 'showcase.%@example.com'
UNION ALL SELECT 'Deals',COUNT(*) FROM deals WHERE name LIKE 'DEMO SHOWCASE -%'
UNION ALL SELECT 'Products',COUNT(*) FROM products WHERE sku LIKE 'DEMO-SHOWCASE-%'
UNION ALL SELECT 'Quotes',COUNT(*) FROM quotes WHERE quote_number LIKE 'Q-DEMO-SHOWCASE-%'
UNION ALL SELECT 'Tasks',COUNT(*) FROM tasks WHERE title LIKE 'DEMO SHOWCASE -%'
UNION ALL SELECT 'Appointments',COUNT(*) FROM appointments WHERE title LIKE 'DEMO SHOWCASE -%'
UNION ALL SELECT 'Activities',COUNT(*) FROM activities WHERE subject LIKE 'DEMO SHOWCASE -%';

SELECT id,name,stage,amount,currency,closed_amount AS closedAmount,closed_date AS closedDate,owner_user_id AS ownerUserId
FROM deals WHERE name LIKE 'DEMO SHOWCASE -%' ORDER BY id;
