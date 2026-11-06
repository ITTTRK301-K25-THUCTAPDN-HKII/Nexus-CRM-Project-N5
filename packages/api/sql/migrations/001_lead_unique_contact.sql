-- Run once on an existing MySQL database to enforce Lead email/phone uniqueness.
-- Remove or correct existing duplicate values before running this migration.
ALTER TABLE leads
  ADD UNIQUE KEY uq_leads_email (email),
  ADD UNIQUE KEY uq_leads_phone (phone);
