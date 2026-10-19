import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import Module, { createRequire } from 'node:module'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import { buildSync } from 'esbuild'
import { createCustomerI18n, translateCustomerText } from '../src/i18n/customerLanguage.js'
import { operationalChinese } from '../src/i18n/operationalTranslations.js'
import { customerChinese } from '../src/i18n/customerTranslations.js'

const root = path.resolve(import.meta.dirname, '..')

test('all operational dictionary entries resolve in both languages with safe interpolation', () => {
  const entries = { ...operationalChinese, ...customerChinese }
  for (const language of ['en', 'zh']) {
    const i18n = createCustomerI18n(language)
    for (const [key, chinese] of Object.entries(entries)) {
      const options = Object.fromEntries([...key.matchAll(/{{(\w+)}}/g)].map((match) => [match[1], match[1] === 'count' ? 2 : '<JJ & Chen>']))
      const result = translateCustomerText(i18n, key, options)
      assert.ok(!result.includes('{{'), `${language}: ${key}`)
      if (language === 'zh') assert.equal(result, chinese.replace(/{{(\w+)}}/g, (_, token) => String(options[token])), key)
    }
  }
})

test('dynamic dialogs, money errors and states translate without changing identifiers', () => {
  const i18n = createCustomerI18n('zh')
  assert.equal(translateCustomerText(i18n, 'Clear Table 12?'), '清空 12 号桌？')
  assert.equal(translateCustomerText(i18n, 'Cash is short by RM 4.10.'), '现金不足，还差 RM 4.10。')
  assert.equal(translateCustomerText(i18n, '29 points'), '29 积分')
  assert.equal(translateCustomerText(i18n, 'Food ready'), '餐点已准备好')
  assert.equal(translateCustomerText(i18n, 'a98b5086-dff8-4aca-b8a7-f42459604745'), 'a98b5086-dff8-4aca-b8a7-f42459604745')
  assert.equal(translateCustomerText(i18n, 'Manicai炒饭 / Fried rice'), 'Manicai炒饭 / Fried rice')
})

test('every literal translation call has a registered key; technical placeholders are intentional', () => {
  const instance = createCustomerI18n('zh')
  const placeholders = new Set(['RM', 'admin@dineos.com', 'https://...'])
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(filename)
      else if (filename.endsWith('.jsx')) {
        traverseModule.default(parse(fs.readFileSync(filename, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }), {
          CallExpression(p) {
            if (!['t', 'uiText'].includes(p.node.callee.name)) return
            const key = p.node.arguments[0]
            if (key?.type === 'StringLiteral') assert.ok(instance.exists(key.value) || placeholders.has(key.value), `${filename}: ${key.value}`)
          },
        })
      }
    }
  }
  visit(path.join(root, 'src'))
})

test('real navigation, kitchen card and receipt render Chinese and English while preserving food and shop names', () => {
  const result = buildSync({
    stdin: { contents: `
      import React from 'react'
      import { renderToStaticMarkup } from 'react-dom/server'
      import { MemoryRouter } from 'react-router-dom'
      import CustomerLanguageProvider from './src/context/CustomerLanguageProvider.jsx'
      import PortalNavigation from './src/components/common/PortalNavigation.jsx'
      import KitchenOrderCard from './src/components/kitchen/KitchenOrderCard.jsx'
      import ReceiptPaper from './src/components/cashier/ReceiptPaper.jsx'
      import SectionHeading from './src/components/common/SectionHeading.jsx'
      import LanguageSwitch from './src/components/customer/LanguageSwitch.jsx'
      export function render() {
        const order = { id: 'test-order', tableNumber: 1, status: 'received', orderType: 'take_away', grandTotal: 9, items: [{name: 'Manicai炒饭', price: 9, quantity: 1}], createdAt: '2026-10-09T12:00:00Z' }
        const receipt = { receiptNumber: 'R001', restaurantName: 'Sinma Stir Fried', tableNumber: 1, paymentMethod: 'Cash', grandTotal: 9, paidAt: order.createdAt, orders: [order] }
        return renderToStaticMarkup(<CustomerLanguageProvider><MemoryRouter><LanguageSwitch /><PortalNavigation navigation={[{label: 'Kitchen', to: '/admin/kitchen', group: 'Daily work'}, {label: 'Cashier', to: '/cashier'}]} /><SectionHeading title="Shop settings" description="Shop settings saved." /><KitchenOrderCard order={order} onUpdateStatus={() => {}} /><ReceiptPaper receipt={receipt} /></MemoryRouter></CustomerLanguageProvider>)
      }
    `, resolveDir: root, loader: 'jsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
  })
  const filename = path.join(root, 'tests', '__language-render.cjs')
  const module = new Module(filename)
  module.filename = filename
  module.paths = Module._nodeModulePaths(root)
  module.require = createRequire(filename)
  module._compile(result.outputFiles[0].text, filename)
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try {
    for (const language of ['en', 'zh']) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => language } })
      const html = module.exports.render()
      for (const text of language === 'zh' ? ['厨房', '日常操作', '店铺设置', '开始准备', '付款收据', '现金'] : ['Kitchen', 'Daily work', 'Shop settings', 'Start preparing', 'Payment receipt', 'Cash']) assert.ok(html.includes(text), `${language}: ${text}`)
      assert.ok(html.includes('Sinma Stir Fried'))
      assert.ok(html.includes('Manicai炒饭'))
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
})
