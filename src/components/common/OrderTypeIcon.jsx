export default function OrderTypeIcon({ orderType, className = 'h-4 w-4' }) {
  if (orderType === 'mixed') return <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-0.5"><OrderTypeIcon orderType="dine_in" className={className}/><OrderTypeIcon orderType="take_away" className={className}/></span>
  return <svg aria-hidden="true" focusable="false" className={`shrink-0 ${className}`} width="24" height="24" viewBox="0 0 26 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {orderType === 'take_away' ? <>
      <path d="M5 7h14l1.4 14H3.6L5 7Z"/>
      <path d="M8 8V6a4 4 0 0 1 8 0v2"/>
    </> : <>
      <circle cx="13" cy="12" r="6.8"/><circle cx="13" cy="12" r="4.3"/>
      <path d="M2 3v5a2 2 0 0 0 4 0V3M4 3v18M23 3v18M23 3c-2 2-2.3 6-2.3 9H23"/>
    </>}
  </svg>
}
