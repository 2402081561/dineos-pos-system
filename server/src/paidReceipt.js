// Used by receipt history, detail and reprint. A receipt must be backed by
// completed payment data and an immutable snapshot of the purchased quantities.
// Legacy receipts without snapshots require all linked orders to be paid.
export const paidReceiptCondition = `payments.paid_at IS NOT NULL AND (
  (jsonb_typeof(payments.order_snapshot) = 'array' AND jsonb_array_length(payments.order_snapshot) > 0)
  OR (
  EXISTS (SELECT 1 FROM orders receipt_orders WHERE receipt_orders.receipt_number = payments.receipt_number AND receipt_orders.payment_status = 'paid')
  AND NOT EXISTS (SELECT 1 FROM orders receipt_orders WHERE receipt_orders.receipt_number = payments.receipt_number AND receipt_orders.payment_status IS DISTINCT FROM 'paid')))`
