import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCustomerI18n, CUSTOMER_LANGUAGE_KEY, formatCustomerDate, readCustomerLanguage, saveCustomerLanguage, translateCustomerText } from '../src/i18n/customerLanguage.js'
import { customerChinese } from '../src/i18n/customerTranslations.js'

test('Chinese and English resolve every UI translation without interpolation leaks', () => {
  for (const language of ['en', 'zh']) {
    const instance = createCustomerI18n(language)
    for (const [key, chinese] of Object.entries(customerChinese)) {
      const options = Object.fromEntries([...key.matchAll(/{{(\w+)}}/g)].map((match) => [match[1], match[1] === 'count' ? 2 : 'TEST']))
      const result = translateCustomerText(instance, key, options)
      assert.equal(typeof result, 'string', key)
      assert.ok(!result.includes('{{'), `${language}: ${key}`)
      if (language === 'zh') assert.equal(result, chinese.replace(/{{(\w+)}}/g, (_match, name) => String(options[name])), key)
    }
  }
})

test('quantities keep correct English singular and plural forms', () => {
  const instance = createCustomerI18n('en')
  assert.equal(translateCustomerText(instance, '{{count}} items', { count: 1 }), '1 item')
  assert.equal(translateCustomerText(instance, '{{count}} items', { count: 2 }), '2 items')
  assert.equal(translateCustomerText(instance, '{{count}} diners', { count: 1 }), '1 diner')
})

test('validation messages preserve dish names and unfamiliar errors', () => {
  const instance = createCustomerI18n('zh')
  assert.equal(translateCustomerText(instance, 'Chicken Chop is no longer available.'), 'Chicken Chop 已无法供应，请从购物车移除。')
  assert.equal(translateCustomerText(instance, '炒米粉 has an invalid quantity.'), '炒米粉 的数量无效，请更新数量。')
  assert.equal(translateCustomerText(instance, 'Unknown future error'), 'Unknown future error')
  assert.equal(translateCustomerText(instance, 'This item is no longer available.'), '这道餐点已无法供应。')
})

test('table labels, timing and dynamic names are localized safely', () => {
  const instance = createCustomerI18n('zh')
  assert.equal(translateCustomerText(instance, 'Table 1'), '1 号桌')
  assert.equal(translateCustomerText(instance, 'Table order 02'), '本桌订单 02')
  assert.equal(translateCustomerText(instance, '3–5 mins'), '3–5 分钟')
  assert.equal(translateCustomerText(instance, 'Welcome, {{name}}', { name: '<Chen & JJ>' }), '欢迎您，<Chen & JJ>')
  assert.equal(translateCustomerText(instance, 'Nasi lemak'), 'Nasi lemak')
})

test('independent customer language instances do not change one another', async () => {
  const first = createCustomerI18n('en')
  const second = createCustomerI18n('en')
  await first.changeLanguage('zh')
  assert.equal(first.t('Menu'), '菜单')
  assert.equal(second.t('Menu'), 'Menu')
  await first.changeLanguage('en')
  assert.equal(first.t('Menu'), 'Menu')
})

test('only a valid language preference is stored and read', () => {
  const values = new Map()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) } })
  try {
    assert.equal(readCustomerLanguage(), 'en')
    saveCustomerLanguage('zh')
    assert.equal(readCustomerLanguage(), 'zh')
    assert.deepEqual([...values.keys()], [CUSTOMER_LANGUAGE_KEY])
    values.set(CUSTOMER_LANGUAGE_KEY, 'unexpected-language')
    assert.equal(readCustomerLanguage(), 'en')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
})

test('blocked browser storage never crashes language selection', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Access denied') } })
  try {
    assert.equal(readCustomerLanguage(), 'en')
    assert.doesNotThrow(() => saveCustomerLanguage('zh'))
    assert.equal(createCustomerI18n('zh').t('Menu'), '菜单')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
})

test('dates follow the selected locale and invalid dates remain safe', () => {
  assert.equal(formatCustomerDate('invalid'), '')
  assert.equal(formatCustomerDate(null), '')
  assert.notEqual(formatCustomerDate('2026-10-04T10:30:00Z', 'en-MY'), formatCustomerDate('2026-10-04T10:30:00Z', 'zh-CN'))
})
