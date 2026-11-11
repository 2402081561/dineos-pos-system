import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { bundleHarness, hookRuntime, memoryStorage, findElement } from './helpers/hookHarness.mjs'

async function fixture(storage = memoryStorage()) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const attributes = new Map()
  const root = { getAttribute: key => attributes.get(key) ?? null, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: root } })
  const runtime = hookRuntime()
  const module = await bundleHarness("export {default as usePortalTheme, PORTAL_THEME_KEY} from './src/hooks/usePortalTheme'; export {default as Toggle} from './src/components/common/PortalThemeToggle'", runtime, { useCustomerLanguage: 'export default ()=>({t:text=>text})' })
  return { ...module, runtime, root, storage, cleanup() {
    runtime.cleanup()
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document
  } }
}

test('employee portals default to light, toggles both ways and persists without network calls', async () => {
  const f = await fixture()
  try {
    let theme = f.runtime.render(f.usePortalTheme); f.runtime.effects()
    assert.equal(theme.theme, 'light')
    theme.toggleTheme()
    theme = f.runtime.render(f.usePortalTheme); f.runtime.effects()
    assert.equal(theme.theme, 'dark')
    assert.equal(f.root.getAttribute('data-portal-theme'), 'dark')
    assert.equal(f.storage.getItem(f.PORTAL_THEME_KEY), 'dark')
    theme.toggleTheme(); theme = f.runtime.render(f.usePortalTheme); f.runtime.effects()
    assert.equal(theme.theme, 'light')
    assert.equal(f.root.getAttribute('data-portal-theme'), 'light')
  } finally { f.cleanup() }
})

test('saved choice is restored and leaving employee portals removes the document theme', async () => {
  const storage = memoryStorage(); storage.setItem('dineos.admin.theme', 'dark')
  const f = await fixture(storage)
  try {
    assert.equal(f.runtime.render(f.usePortalTheme).theme, 'dark'); f.runtime.effects()
    assert.equal(f.root.getAttribute('data-portal-theme'), 'dark')
    f.runtime.cleanup()
    assert.equal(f.root.getAttribute('data-portal-theme'), null)
    assert.equal(storage.getItem(f.PORTAL_THEME_KEY), 'dark')
  } finally { f.cleanup() }
})

test('customer opt-out neither applies a theme nor rewrites the employee preference', async () => {
  const storage = memoryStorage(); storage.setItem('dineos.portal.theme', 'dark')
  const f = await fixture(storage)
  const customer = () => f.usePortalTheme(false)
  try {
    f.runtime.render(customer); f.runtime.effects()
    assert.equal(f.root.getAttribute('data-portal-theme'), null)
    assert.equal(storage.getItem(f.PORTAL_THEME_KEY), 'dark')
  } finally { f.cleanup() }
})

test('employee areas share the same choice across unmount and remount', async () => {
  const storage = memoryStorage()
  const admin = await fixture(storage)
  try {
    const value = admin.runtime.render(admin.usePortalTheme); admin.runtime.effects()
    value.toggleTheme(); admin.runtime.render(admin.usePortalTheme); admin.runtime.effects()
  } finally { admin.cleanup() }
  for (const role of ['Cashier', 'Kitchen', 'Staff']) {
    const next = await fixture(storage)
    try {
      assert.equal(next.runtime.render(next.usePortalTheme).theme, 'dark', role)
      next.runtime.effects()
      assert.equal(next.root.getAttribute('data-portal-theme'), 'dark', role)
    } finally { next.cleanup() }
  }
})

test('new preference overrides the legacy Admin preview preference', async () => {
  const storage = memoryStorage()
  storage.setItem('dineos.admin.theme', 'dark'); storage.setItem('dineos.portal.theme', 'light')
  const f = await fixture(storage)
  try { assert.equal(f.runtime.render(f.usePortalTheme).theme, 'light') } finally { f.cleanup() }
})

test('blocked browser storage never prevents theme switching', async () => {
  const f = await fixture({ getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
  try {
    const theme = f.runtime.render(f.usePortalTheme); f.runtime.effects()
    assert.equal(theme.theme, 'light'); theme.toggleTheme()
    assert.equal(f.runtime.render(f.usePortalTheme).theme, 'dark'); f.runtime.effects()
    assert.equal(f.root.getAttribute('data-portal-theme'), 'dark')
  } finally { f.cleanup() }
})

test('toggle exposes an accessible pressed state and translated next action', async () => {
  const f = await fixture()
  try {
    let calls = 0
    for (const theme of ['light', 'dark']) {
      const button = findElement(f.runtime.render(f.Toggle, { theme, onToggle: () => calls++ }), node => node.type === 'button')
      assert.equal(button.props['aria-label'], 'Dark mode')
      assert.equal(button.props['aria-pressed'], theme === 'dark')
      assert.equal(button.props.title, theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')
      button.props.onClick()
    }
    assert.equal(calls, 2)
  } finally { f.cleanup() }
})

test('every theme style is employee-portal-scoped, screen-only and does not invert images', () => {
  const css = readFileSync(new URL('../src/styles/portal-theme.css', import.meta.url), 'utf8')
  const ast = postcss.parse(css)
  ast.walkRules(rule => {
    for (const selector of rule.selectors) assert.ok(selector.startsWith("html[data-portal-theme='dark']"), selector)
    assert.equal(rule.parent.type, 'atrule')
    assert.equal(rule.parent.name, 'media')
    assert.equal(rule.parent.params, 'screen')
  })
  ast.walkDecls(decl => assert.notEqual(decl.prop, 'filter'))
  let paperRule
  ast.walkRules(rule => { if (rule.selector.includes('.kitchen-ticket-paper')) paperRule = rule })
  assert.ok(paperRule, 'Printed-paper previews need an explicit light surface')
  const paper = Object.fromEntries(paperRule.nodes.map(decl => [decl.prop, decl.value]))
  assert.equal(paper.background, '#fff')
  assert.equal(paper.color, '#111')
  assert.equal(paper['color-scheme'], 'light')
  const shell = readFileSync(new URL('../src/components/common/PortalLayout.jsx', import.meta.url), 'utf8')
  assert.match(shell, /\['Admin', 'Cashier', 'Kitchen', 'Staff'\]\.includes\(area\)/)
  assert.match(shell, /usePortalTheme\(employeePortal\)/)
  assert.match(shell, /PortalThemeToggle/)
  for (const layout of ['Admin', 'Cashier', 'Kitchen', 'Staff']) {
    assert.match(readFileSync(new URL('../src/layouts/' + layout + 'Layout.jsx', import.meta.url), 'utf8'), /<PortalLayout/)
  }
  assert.doesNotMatch(readFileSync(new URL('../src/layouts/CustomerLayout.jsx', import.meta.url), 'utf8'), /usePortalTheme|PortalThemeToggle/)
  assert.match(readFileSync(new URL('../src/pages/admin/Login.jsx', import.meta.url), 'utf8'), /usePortalTheme\(\)/)
})
