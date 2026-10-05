import { useContext } from 'react'
import { CustomerLanguageContext } from '../context/CustomerLanguageContext'

export default function useCustomerLanguage() {
  return useContext(CustomerLanguageContext)
}
