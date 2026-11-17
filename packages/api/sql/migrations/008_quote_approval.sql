-- Add internal approval metadata without changing customer-facing quote statuses.
ALTER TABLE quotes
  ADD COLUMN approval_status ENUM('NOT_REQUESTED','PENDING','APPROVED','REJECTED')
    NOT NULL DEFAULT 'NOT_REQUESTED' AFTER status,
  ADD COLUMN approval_requested_at DATETIME NULL AFTER approval_status,
  ADD COLUMN approval_decided_at DATETIME NULL AFTER approval_requested_at,
  ADD COLUMN approval_decided_by_user_id BIGINT UNSIGNED NULL AFTER approval_decided_at,
  ADD COLUMN approval_note VARCHAR(1000) NULL AFTER approval_decided_by_user_id,
  ADD KEY idx_quotes_approval (approval_status,approval_requested_at),
  ADD CONSTRAINT fk_quotes_approver FOREIGN KEY (approval_decided_by_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS quote_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quote_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  event_type ENUM('STATUS_CHANGED','APPROVAL_REQUESTED','APPROVED','APPROVAL_REJECTED') NOT NULL,
  previous_value VARCHAR(40) NULL,
  new_value VARCHAR(40) NULL,
  note VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quote_history_quote_time (quote_id,created_at),
  CONSTRAINT fk_quote_history_quote FOREIGN KEY (quote_id) REFERENCES quotes(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_quote_history_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
