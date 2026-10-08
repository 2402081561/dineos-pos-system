import { formatCurrency } from '../../utils/currency'
import { getReceiptDetails } from '../../utils/receipt'
import useShopSettings from '../../hooks/useShopSettings'
import { optionText } from '../../../server/src/posRules'

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
      {receipt.shopSnapshot?.logoUrl && <img alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} src={receipt.shopSnapshot.logoUrl} style={{ maxWidth: '35mm', maxHeight: '25mm', margin: '0 auto 2mm', objectFit: 'contain' }} />}<h1 className="break-words">{receipt.restaurantName || name}</h1>
      {receipt.shopSnapshot?.address && <p className="whitespace-pre-line">{receipt.shopSnapshot.address}</p>}
      {receipt.shopSnapshot?.phone && <p>{receipt.shopSnapshot.phone}</p>}
      <p>Payment receipt</p>
      <p className="receipt-table-label">TABLE</p>
      <p className="receipt-table-number">{receipt.tableNumber ?? '—'}</p>
    </header>
    <dl className="receipt-block receipt-information">
      <ReceiptRow label="Receipt"><strong>{receipt.receiptNumber}</strong></ReceiptRow>
      <ReceiptRow label="Date">{paidDate(receipt.paidAt)}</ReceiptRow>
      <ReceiptRow label="Type">{details.orderType}</ReceiptRow>
      <ReceiptRow label="Table">{receipt.tableNumber ?? '—'}</ReceiptRow>
      <ReceiptRow label="Cashier">{details.cashier}</ReceiptRow>
      <ReceiptRow label="Customer(s)">{details.customers.join(', ') || 'Guest'}</ReceiptRow>
    </dl>
    <div className="receipt-block receipt-items">
      {details.items.map((item, index) => <div className="receipt-item" key={`${item.menuItemId}-${index}`}>
        <div className="receipt-row"><p>{item.quantity}× {item.name}</p><p className="receipt-amount">{formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 0))}</p></div>
        {item.orderType === 'take_away' && <p className="receipt-item-note font-bold">TAKE AWAY</p>}{optionText(item.optionSnapshot) && <p className="receipt-item-note">{optionText(item.optionSnapshot)}</p>}{item.notes && <p className="receipt-item-note">{item.notes}</p>}
      </div>)}
    </div>
    <dl className="receipt-block receipt-totals">
      <ReceiptRow label="Subtotal">{formatCurrency(details.subtotal)}</ReceiptRow>
      {details.discount > 0 && <ReceiptRow label="Discount">−{formatCurrency(details.discount)}</ReceiptRow>}
      {details.serviceCharge > 0 && <ReceiptRow label="Service charge">{formatCurrency(details.serviceCharge)}</ReceiptRow>}
      {details.sst > 0 && <ReceiptRow label="SST">{formatCurrency(details.sst)}</ReceiptRow>}
      <ReceiptRow className="receipt-total" label="TOTAL">{formatCurrency(receipt.grandTotal)}</ReceiptRow>
      <ReceiptRow label="Paid by">{receipt.paymentMethod}</ReceiptRow>
      {details.cashTender && <>
        <ReceiptRow label="Cash received">{formatCurrency(details.cashTender.received)}</ReceiptRow>
        <ReceiptRow className="receipt-change" label="Change">{formatCurrency(details.cashTender.change)}</ReceiptRow>
      </>}
    </dl>
    <footer className="receipt-block receipt-footer whitespace-pre-line">{receipt.shopSnapshot?.receiptFooter ?? 'Thank you! Please come again.'}</footer>
  </article>
}
