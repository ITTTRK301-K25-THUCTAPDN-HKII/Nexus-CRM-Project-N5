-- Add immutable quote revision chains and a history event for each new version.
ALTER TABLE quotes
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 AFTER quote_number,
  ADD COLUMN version_group_id BIGINT UNSIGNED NULL AFTER version,
  ADD COLUMN previous_version_id BIGINT UNSIGNED NULL AFTER version_group_id,
  ADD KEY idx_quotes_previous_version (previous_version_id);

-- Existing quotes become the first version in their own version group.
UPDATE quotes
SET version_group_id=id
WHERE version_group_id IS NULL AND id > 0;

ALTER TABLE quotes
  ADD UNIQUE KEY uq_quotes_version_group (version_group_id,version),
  ADD CONSTRAINT fk_quotes_version_group FOREIGN KEY (version_group_id) REFERENCES quotes(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_quotes_previous_version FOREIGN KEY (previous_version_id) REFERENCES quotes(id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE quote_history
  MODIFY COLUMN event_type ENUM(
    'STATUS_CHANGED','APPROVAL_REQUESTED','APPROVED','APPROVAL_REJECTED','VERSION_CREATED'
  ) NOT NULL;
