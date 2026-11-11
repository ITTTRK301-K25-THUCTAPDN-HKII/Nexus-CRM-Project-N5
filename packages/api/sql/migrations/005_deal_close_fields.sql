-- Run once on an existing database to save actual WON value/date and LOST reason.
ALTER TABLE deals
  ADD COLUMN closed_amount DECIMAL(15,2) NULL,
  ADD COLUMN closed_date DATE NULL,
  ADD COLUMN lost_reason VARCHAR(1000) NULL;
