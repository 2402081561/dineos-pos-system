import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { orderTypeLabel } from '../../../server/src/orderType'

export default function OrderTypeBadge({ orderType, className = '' }) {
  const { t } = useCustomerLanguage()
  const takeaway = orderType === 'take_away' || orderType === 'mixed'
  return <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${takeaway ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-slate-200 bg-slate-50 text-slate-600'} ${className}`}>
    <span aria-hidden="true">{takeaway ? '▣' : '●'}</span>{t(orderTypeLabel(orderType))}
  </span>
}
