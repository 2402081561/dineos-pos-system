import OrderTypeBadge from './OrderTypeBadge'
import { optionText } from '../../../server/src/posRules'
export default function OptionSummary({ item, className = '' }) {
  const summary = optionText(item?.optionSnapshot ?? [])
  return <>{item?.orderType && <OrderTypeBadge orderType={item.orderType} className="mt-1" />}{summary ? <p className={`mt-1 break-words text-xs leading-5 text-slate-600 ${className}`}>{summary}</p> : null}</>
}
