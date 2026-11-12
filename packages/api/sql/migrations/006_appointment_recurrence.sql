-- Run once on an existing database to support recurring appointments.
CREATE TABLE IF NOT EXISTS appointment_series (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organizer_user_id BIGINT UNSIGNED NOT NULL,
  lead_id BIGINT UNSIGNED NULL,
  account_id BIGINT UNSIGNED NULL,
  contact_id BIGINT UNSIGNED NULL,
  deal_id BIGINT UNSIGNED NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  location VARCHAR(255) NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  recurrence_frequency ENUM('WEEKLY','MONTHLY') NOT NULL,
  recurrence_until DATE NULL,
  next_starts_at DATETIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_appointment_series_next (is_active, next_starts_at),
  KEY idx_appointment_series_organizer (organizer_user_id),
  CONSTRAINT chk_appointment_series_time CHECK (ends_at > starts_at),
  CONSTRAINT fk_appointment_series_organizer FOREIGN KEY (organizer_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_appointment_series_lead FOREIGN KEY (lead_id) REFERENCES leads(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_appointment_series_account FOREIGN KEY (account_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_appointment_series_contact FOREIGN KEY (contact_id) REFERENCES contacts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_appointment_series_deal FOREIGN KEY (deal_id) REFERENCES deals(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE appointments
  ADD COLUMN recurrence_series_id BIGINT UNSIGNED NULL AFTER organizer_user_id,
  ADD UNIQUE KEY uq_appointments_series_start (recurrence_series_id, starts_at),
  ADD CONSTRAINT fk_appointments_series FOREIGN KEY (recurrence_series_id) REFERENCES appointment_series(id)
    ON UPDATE CASCADE ON DELETE SET NULL;
