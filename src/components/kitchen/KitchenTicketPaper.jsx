// Render the same validated ticket rows sent to the Android helper. Quantity
// columns are a browser/print layout; the v1 helper payload stays compatible.
export default function KitchenTicketPaper({ ticket, label }) {
  let inItems = false
  return <article aria-label={label} className="kitchen-ticket-paper">
    {ticket.rows.map((row, index) => {
      if (row.style === 'rule') {
        inItems = false
        return <hr className="kitchen-ticket-rule" key={index} />
      }
      if (row.style === 'heading') return <p className={index === 0 ? 'kitchen-ticket-title' : index === 1 ? 'kitchen-ticket-location' : 'kitchen-ticket-reference'} key={index}>{row.left}</p>
      if (row.style === 'bold' && /^【.*】$/u.test(row.left)) {
        inItems = false
        return <p className="kitchen-ticket-group" key={index}>{row.left.slice(1, -1)}</p>
      }
      const item = row.style === 'bold' && /^(\d+)×\s+(.+)$/u.exec(row.left)
      if (item) {
        inItems = true
        return <div className="kitchen-ticket-item" key={index}><strong className="kitchen-ticket-quantity">{item[1]}×</strong><p className="kitchen-ticket-name">{item[2]}</p></div>
      }
      return <p className={inItems ? 'kitchen-ticket-detail' : 'kitchen-ticket-warning'} key={index}>{row.left}</p>
    })}
  </article>
}
