import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerLanguageContext } from './CustomerLanguageContext'
import { createCustomerI18n, formatCustomerDate, saveCustomerLanguage, translateCustomerText } from '../i18n/customerLanguage'

function CustomerLanguageProvider({ children }) {
  const [instance] = useState(createCustomerI18n)
  const { i18n } = useTranslation('translation', { i18n: instance, useSuspense: false })
  const language = i18n.language === 'zh' ? 'zh' : 'en'
  const locale = language === 'zh' ? 'zh-CN' : 'en-MY'

  useEffect(() => {
    const previous = document.documentElement.lang
    document.documentElement.lang = locale
    return () => { document.documentElement.lang = previous }
  }, [locale])

  const value = useMemo(() => {
    const t = (text, options) => translateCustomerText(instance, text, options)
    return {
      language, locale, t,
      setLanguage: (next) => {
        if (!['en', 'zh'].includes(next)) return
        saveCustomerLanguage(next)
        void instance.changeLanguage(next)
      },
      formatDate: (date) => formatCustomerDate(date, locale) || t('Date unavailable'),
      statusLabel: (status) => {
        const text = String(status ?? '—')
        if (text === 'no_orders') return t('No orders yet')
        return t(instance.exists(text) ? text : text.replace(/\b\w/g, (letter) => letter.toUpperCase()))
      },
    }
  }, [instance, language, locale])

  return <CustomerLanguageContext.Provider value={value}>{children}</CustomerLanguageContext.Provider>
}

export default CustomerLanguageProvider
