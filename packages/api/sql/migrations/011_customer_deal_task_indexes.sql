-- Run once on an existing MySQL database to support common CRM list filters.
-- Lead.phone already has a UNIQUE index; task reminder scans already use
-- idx_tasks_telegram_due (status,due_at,telegram_notified_at).
ALTER TABLE accounts
  ADD KEY idx_accounts_owner_phone (owner_user_id,phone);

ALTER TABLE leads
  ADD KEY idx_leads_owner_active_status (owner_user_id,deleted_at,status);

ALTER TABLE contacts
  ADD KEY idx_contacts_owner_phone (owner_user_id,phone);

ALTER TABLE deals
  ADD KEY idx_deals_owner_stage (owner_user_id,stage);

ALTER TABLE tasks
  ADD KEY idx_tasks_assignee_due (assigned_to_user_id,due_at);
