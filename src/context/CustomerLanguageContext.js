import { createContext } from 'react'
import { formatCustomerDate } from '../i18n/customerLanguage'

const english = (text, options = {}) => typeof text === 'string'
  ? text.replace(/{{(\w+)}}/g, (match, key) => options[key] === undefined ? match : String(options[key]))
  : text

// Shared controls retain English when rendered outside the customer layout.
export const CustomerLanguageContext = createContext({
  language: 'en', locale: 'en-MY', t: english,
  formatDate: formatCustomerDate,
  statusLabel: (status) => String(status ?? '—').replace(/\b\w/g, (letter) => letter.toUpperCase()),
})
