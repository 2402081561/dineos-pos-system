-- Old receipts retain NULL: never invent historical tender/change amounts.
ALTER TABLE payments ADD COLUMN cash_received numeric(12,2);
ALTER TABLE payments ADD COLUMN change_amount numeric(12,2);
ALTER TABLE payments ADD CONSTRAINT payments_cash_tender_check CHECK (
  (cash_received IS NULL AND change_amount IS NULL)
  OR (
    payment_method = 'Cash'
    AND cash_received IS NOT NULL AND change_amount IS NOT NULL
    AND cash_received >= amount
    AND change_amount = cash_received - amount
  )
);
