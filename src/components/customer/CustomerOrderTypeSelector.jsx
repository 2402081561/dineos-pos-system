import { useContext } from 'react'
import { CustomerSessionContext } from '../../context/CustomerSessionContext'
import OrderTypeSelector from '../common/OrderTypeSelector'

export default function CustomerOrderTypeSelector(props) {
  const { session } = useContext(CustomerSessionContext) ?? {}
  return session?.isTakeawayQr ? null : <OrderTypeSelector {...props} />
}
