-- Run once on an existing MySQL database to support Lead list filters/search.
ALTER TABLE leads
  ADD KEY idx_leads_name (name),
  ADD KEY idx_leads_source (source);
