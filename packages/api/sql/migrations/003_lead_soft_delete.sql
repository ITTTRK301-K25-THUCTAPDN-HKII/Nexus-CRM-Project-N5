-- Run once on an existing MySQL database to enable soft deletion of Leads.
ALTER TABLE leads
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL;

CREATE INDEX idx_leads_active_created
  ON leads (deleted_at, created_at);
