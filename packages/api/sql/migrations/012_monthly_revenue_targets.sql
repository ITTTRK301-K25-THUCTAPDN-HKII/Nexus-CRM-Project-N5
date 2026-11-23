CREATE TABLE IF NOT EXISTS monthly_revenue_targets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  month_start DATE NOT NULL,
  currency CHAR(3) NOT NULL,
  target_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_revenue_target_user_month_currency (user_id,month_start,currency),
  CONSTRAINT chk_revenue_target_month_start CHECK (DAYOFMONTH(month_start) = 1),
  CONSTRAINT chk_revenue_target_amount CHECK (target_amount >= 0),
  CONSTRAINT fk_revenue_target_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
