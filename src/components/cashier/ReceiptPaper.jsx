import { formatCurrency } from '../../utils/currency'
import { getReceiptDetails } from '../../utils/receipt'
import useShopSettings from '../../hooks/useShopSettings'

function paidDate(value) {
  if (!value) return '—'
  const date = value?.toDate?.() ?? new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuching', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date)
}

function ReceiptRow({ label, children, className = '' }) {
  return <div className={`receipt-row ${className}`}><dt>{label}</dt><dd>{children}</dd></div>
}

export default function ReceiptPaper({ receipt }) {
  const { name } = useShopSettings()
  const details = getReceiptDetails(receipt)
  return <article aria-label={`Receipt ${receipt.receiptNumber}`} className="receipt-print thermal-receipt">
    <header className="receipt-heading">
      <h1 className="break-words">{receipt.restaurantName || name}</h1>
      <p>Payment receipt</p>
      <p className="receipt-table-label">TABLE</p>
      <p className="receipt-table-number">{receipt.tableNumber ?? '—'}</p>
    </header>
    <dl className="receipt-block receipt-information">
      <ReceiptRow label="Receipt"><strong>{receipt.receiptNumber}</strong></ReceiptRow>
      <ReceiptRow label="Date">{paidDate(receipt.paidAt)}</ReceiptRow>
      <ReceiptRow label="Table">{receipt.tableNumber ?? '—'}</ReceiptRow>
      <ReceiptRow label="Cashier">{details.cashier}</ReceiptRow>
      <ReceiptRow label="Customer(s)">{details.customers.join(', ') || 'Guest'}</ReceiptRow>
    </dl>
    <div className="receipt-block receipt-items">
      {details.items.map((item, index) => <div className="receipt-item" key={`${item.menuItemId}-${index}`}>
        <div className="receipt-row"><p>{item.quantity}× {item.name}</p><p className="receipt-amount">{formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 0))}</p></div>
        {item.notes && <p className="receipt-item-note">{item.notes}</p>}
      </div>)}
    </div>
    <dl className="receipt-block receipt-totals">
      <ReceiptRow label="Subtotal">{formatCurrency(details.subtotal)}</ReceiptRow>
      {details.discount > 0 && <ReceiptRow label="Discount">−{formatCurrency(details.discount)}</ReceiptRow>}
      <ReceiptRow label="Service charge">{formatCurrency(details.serviceCharge)}</ReceiptRow>
      <ReceiptRow label="SST">{formatCurrency(details.sst)}</ReceiptRow>
      <ReceiptRow className="receipt-total" label="TOTAL">{formatCurrency(receipt.grandTotal)}</ReceiptRow>
      <ReceiptRow label="Paid by">{receipt.paymentMethod}</ReceiptRow>
      {details.cashTender && <>
        <ReceiptRow label="Cash received">{formatCurrency(details.cashTender.received)}</ReceiptRow>
        <ReceiptRow className="receipt-change" label="Change">{formatCurrency(details.cashTender.change)}</ReceiptRow>
      </>}
    </dl>
    <footer className="receipt-block receipt-footer">Thank you! Please come again.</footer>
  </article>
}
