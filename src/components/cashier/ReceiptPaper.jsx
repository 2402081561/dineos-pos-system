import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { formatCurrency } from '../../utils/currency'
import { getReceiptDetails } from '../../utils/receipt'
import useShopSettings from '../../hooks/useShopSettings'
import { optionText } from '../../../server/src/posRules'



function ReceiptRow({ label, children, className = '' }) {
  const { t: uiText } = useCustomerLanguage()

  return <div className={`receipt-row ${className}`}><dt>{uiText(label)}</dt><dd>{children}</dd></div>
}

export default function ReceiptPaper({ receipt }) {
  const { t: uiText, formatDate: uiDate } = useCustomerLanguage()

  const { name } = useShopSettings()
  const details = getReceiptDetails(receipt)
  return <article aria-label={uiText("Receipt {{v0}}", { v0: receipt.receiptNumber })} className="receipt-print thermal-receipt">
    <header className="receipt-heading">
      {receipt.shopSnapshot?.logoUrl && <img alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} src={receipt.shopSnapshot.logoUrl} style={{ maxWidth: '35mm', maxHeight: '25mm', margin: '0 auto 2mm', objectFit: 'contain' }} />}<h1 className="break-words">{receipt.restaurantName || name}</h1>
      {receipt.shopSnapshot?.address && <p className="whitespace-pre-line">{receipt.shopSnapshot.address}</p>}
      {receipt.shopSnapshot?.phone && <p>{receipt.shopSnapshot.phone}</p>}
      <p>{uiText("Payment receipt")}</p>
      <p className="receipt-table-label">{uiText("TABLE")}</p>
      <p className="receipt-table-number">{receipt.tableNumber ?? '—'}</p>
    </header>
    <dl className="receipt-block receipt-information">
      <ReceiptRow label="Receipt"><strong>{receipt.receiptNumber}</strong></ReceiptRow>
      <ReceiptRow label="Date">{uiDate(receipt.paidAt)}</ReceiptRow>
      <ReceiptRow label="Type">{uiText(details.orderType)}</ReceiptRow>
      <ReceiptRow label="Table">{receipt.tableNumber ?? '—'}</ReceiptRow>
      <ReceiptRow label="Cashier">{details.cashier}</ReceiptRow>
      <ReceiptRow label="Customer(s)">{uiText(details.customers.join(', ') || 'Guest')}</ReceiptRow>
    </dl>
    <div className="receipt-block receipt-items">
      {details.items.map((item, index) => <div className="receipt-item" key={`${item.menuItemId}-${index}`}>
        <div className="receipt-row"><p>{item.quantity}× {item.name}</p><p className="receipt-amount">{formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 0))}</p></div>
        {item.orderType === 'take_away' && <p className="receipt-item-note font-bold">{uiText("TAKE AWAY")}</p>}{optionText(item.optionSnapshot) && <p className="receipt-item-note">{optionText(item.optionSnapshot)}</p>}{item.notes && <p className="receipt-item-note">{item.notes}</p>}
      </div>)}
    </div>
    <dl className="receipt-block receipt-totals">
      <ReceiptRow label="Subtotal">{formatCurrency(details.subtotal)}</ReceiptRow>
      {details.discount > 0 && <ReceiptRow label="Discount">−{formatCurrency(details.discount)}</ReceiptRow>}
      {details.serviceCharge > 0 && <ReceiptRow label="Service charge">{formatCurrency(details.serviceCharge)}</ReceiptRow>}
      {details.sst > 0 && <ReceiptRow label="SST">{formatCurrency(details.sst)}</ReceiptRow>}
      <ReceiptRow className="receipt-total" label="TOTAL">{formatCurrency(receipt.grandTotal)}</ReceiptRow>
      <ReceiptRow label="Paid by">{uiText(receipt.paymentMethod)}</ReceiptRow>
      {details.cashTender && <>
        <ReceiptRow label="Cash received">{formatCurrency(details.cashTender.received)}</ReceiptRow>
        <ReceiptRow className="receipt-change" label="Change">{formatCurrency(details.cashTender.change)}</ReceiptRow>
      </>}
    </dl>
    <footer className="receipt-block receipt-footer whitespace-pre-line">{uiText(receipt.shopSnapshot?.receiptFooter ?? uiText('Thank you! Please come again.'))}</footer>
  </article>
}
