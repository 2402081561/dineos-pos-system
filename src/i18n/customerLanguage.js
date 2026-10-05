import { createInstance } from 'i18next'
import { customerChinese } from './customerTranslations.js'

export const CUSTOMER_LANGUAGE_KEY = 'dineos:customer-language'

export function readCustomerLanguage() {
  try { return localStorage.getItem(CUSTOMER_LANGUAGE_KEY) === 'zh' ? 'zh' : 'en' }
  catch { return 'en' }
}

export function saveCustomerLanguage(language) {
  if (!['en', 'zh'].includes(language)) return
  try { localStorage.setItem(CUSTOMER_LANGUAGE_KEY, language) } catch { /* Switching still works when storage is blocked. */ }
}

export function createCustomerI18n(language = readCustomerLanguage()) {
  const instance = createInstance()
  void instance.init({
    lng: language === 'zh' ? 'zh' : 'en',
    supportedLngs: ['en', 'zh'],
    fallbackLng: 'en',
    initAsync: false,
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: {
        ...Object.fromEntries(Object.keys(customerChinese).map((key) => [key, key.replace(/_(one|other)$/, '')])),
        '{{count}} items_one': '{{count}} item',
        'View cart, {{count}} items_one': 'View cart, {{count}} item',
        'View cart, {{count}} items_other': 'View cart, {{count}} items',
        '{{count}} items ready to order_one': '{{count}} item ready to order',
        '{{count}} items ready to order_other': '{{count}} items ready to order',
        '{{count}} diners_one': '{{count}} diner',
        '{{count}} diners_other': '{{count}} diners',
        '{{count}} items added to your cart._one': '{{count}} item added to your cart.',
        '{{count}} items added to your cart._other': '{{count}} items added to your cart.',
      } },
      zh: { translation: customerChinese },
    },
  })
  return instance
}

// Translate known validation messages without changing their underlying English
// error strings or translating the menu item name interpolated into the message.
export function translateCustomerText(instance, text, options = {}) {
  if (typeof text !== 'string') return text
  if (instance.exists(text)) return instance.t(text, options)
  const minutes = /^(\d+)–(\d+) mins$/.exec(text)
  if (minutes) return instance.t('{{min}}–{{max}} mins', { min: minutes[1], max: minutes[2] })
  const table = /^Table (\d+|—)$/.exec(text)
  if (table) return instance.t('Table {{number}}', { number: table[1] })
  const tableOrder = /^Table order (\d+)$/.exec(text)
  if (tableOrder) return instance.t('Table order {{number}}', { number: tableOrder[1] })
  const itemErrors = [
    'is no longer on the menu.', 'has an invalid quantity.',
    'has incomplete menu information.', 'is no longer available.',
    'has an invalid price and cannot be ordered.',
  ]
  for (const ending of itemErrors) {
    const suffix = ` ${ending}`
    if (text.endsWith(suffix)) {
      const name = text.slice(0, -suffix.length)
      return instance.t(`{{name}} ${ending}`, { name: name === 'This item' ? instance.t('This item') : name })
    }
  }
  return instance.t(text, { defaultValue: text, ...options })
}

export function formatCustomerDate(value, locale = 'en-MY') {
  if (!value) return ''
  const date = value?.toDate?.() ?? new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
