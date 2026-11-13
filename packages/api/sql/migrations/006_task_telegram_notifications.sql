-- Run once on an existing MySQL database to enable Telegram task reminders.
ALTER TABLE users
  ADD COLUMN telegram_chat_id VARCHAR(100) NULL;

ALTER TABLE tasks
  ADD COLUMN telegram_notified_at DATETIME NULL,
  ADD COLUMN telegram_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD KEY idx_tasks_telegram_due (status, due_at, telegram_notified_at);
