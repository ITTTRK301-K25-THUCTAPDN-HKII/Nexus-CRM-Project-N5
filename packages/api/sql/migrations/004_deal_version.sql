-- Run once on an existing database to enable optimistic locking for Deal stage changes.
ALTER TABLE deals
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1;
