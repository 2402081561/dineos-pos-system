import { useContext } from 'react'
import { CustomerSessionContext } from '../context/CustomerSessionContext'

function useCustomerSession() {
  const customerSession = useContext(CustomerSessionContext)
  if (!customerSession) throw new Error('useCustomerSession must be used within a CustomerSessionProvider.')
  return customerSession
}

export default useCustomerSession
