// Used by receipt history, detail and reprint. A receipt must be backed by
// completed payment data and all its linked orders must have been paid.
export const paidReceiptCondition = `payments.paid_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM orders receipt_orders WHERE receipt_orders.receipt_number = payments.receipt_number AND receipt_orders.payment_status = 'paid')
  AND NOT EXISTS (SELECT 1 FROM orders receipt_orders WHERE receipt_orders.receipt_number = payments.receipt_number AND receipt_orders.payment_status IS DISTINCT FROM 'paid')`
