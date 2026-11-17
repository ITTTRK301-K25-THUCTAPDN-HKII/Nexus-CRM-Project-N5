-- Store quote discounts, VAT rate, and grand total with fixed precision.
ALTER TABLE quotes
  ADD COLUMN discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER subtotal,
  ADD COLUMN vat_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00 AFTER discount_amount,
  ADD COLUMN grand_total DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER tax_amount;

UPDATE quotes SET grand_total=total_amount;
