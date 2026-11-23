import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

async function fixture({ reduced = false, pathname = '/admin/orders' } = {}) {
  const saved = Object.fromEntries(['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const runtime = hookRuntime(), app = { inert: false }, restored = [], focused = []
  const first = { getClientRects: () => [1], focus: () => focused.push('first') }
  const last = { getClientRects: () => [1], focus: () => focused.push('last') }
  const previous = { isConnected: true, focus: () => focused.push('previous') }
  const body = { style: { overflow: 'auto', position: '', top: '', width: '' } }
  const desktop = { matches: false, addEventListener(_type, fn) { this.listener = fn }, removeEventListener() { this.listener = null } }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body, activeElement: previous, getElementById: () => app } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { scrollY: 320, scrollTo: value => restored.push(value), matchMedia: query => query.includes('1024') ? desktop : { matches: reduced } } })
  const h = await bundleHarness("export {default as More} from './src/components/admin/AdminMoreMenu.jsx';export {default as Nav} from './src/components/admin/AdminMobileNavigation.jsx'", runtime, {
    useCustomerLanguage: 'export default ()=>({t:text=>text,language:"zh"})',
    'react-dom': 'export const createPortal=(node,target)=>({type:"portal",props:{children:node,target}})',
    'react-router-dom': `export const NavLink='NavLink';export const useLocation=()=>({pathname:${JSON.stringify(pathname)}})`,
  })
  return { ...h, runtime, app, body, first, last, focused, restored, desktop,
    view(onClose = () => {}) {
      const view = runtime.render(h.More, { id: 'admin-more-menu', items: [{ to: '/admin/menu', label: 'Menu' }], onClose })
      const section = findElement(view, node => node.props?.role === 'dialog')
      section.props.ref.current = { focus: () => focused.push('panel'), querySelectorAll: () => [first, last] }
      return view
    },
    cleanup() { runtime.cleanup(); for (const key of Object.keys(saved)) { if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else delete globalThis[key] } },
  }
}

test('More is portalled outside the blurred navigation, locks background and restores scroll/focus', async () => {
  const f = await fixture()
  try {
    const view = f.view(); f.runtime.effects()
    assert.equal(view.type, 'portal'); assert.equal(view.props.target, document.body)
    assert.equal(f.body.style.position, 'fixed'); assert.equal(f.body.style.top, '-320px'); assert.equal(f.app.inert, true)
    const sheet = findElement(view, node => node.props?.role === 'dialog')
    assert.equal(sheet.props['aria-modal'], 'true'); assert.match(sheet.props.className, /80dvh/)
    f.runtime.cleanup()
    assert.equal(f.app.inert, false); assert.equal(f.body.style.overflow, 'auto')
    assert.deepEqual(f.restored.at(-1), { top: 320, behavior: 'instant' }); assert.equal(f.focused.at(-1), 'previous')
  } finally { f.cleanup() }
})

test('close, backdrop and Escape respect reduced motion; menu links navigate without a loading delay', async () => {
  for (const action of ['close', 'backdrop', 'escape', 'link']) {
    const f = await fixture({ reduced: true }); let closed = 0
    try {
      const view = f.view(() => closed++)
      if (action === 'close') findElement(view, node => node.type === 'button').props.onClick()
      if (action === 'backdrop') findElement(view, node => node.props?.className?.startsWith('admin-more-backdrop')).props.onClick()
      if (action === 'escape') findElement(view, node => node.props?.onKeyDown).props.onKeyDown({ key: 'Escape', preventDefault() {} })
      if (action === 'link') findElement(view, node => node.type === 'NavLink').props.onClick()
      assert.equal(closed, 1, action)
    } finally { f.cleanup() }
  }
})

test('keyboard focus is trapped and switching to desktop closes the mobile sheet', async () => {
  const f = await fixture(); let closed = 0
  try {
    const view = f.view(() => closed++); f.runtime.effects()
    const keyDown = findElement(view, node => node.props?.onKeyDown).props.onKeyDown
    document.activeElement = f.first; keyDown({ key: 'Tab', shiftKey: true, preventDefault() {} })
    assert.equal(f.focused.at(-1), 'last')
    document.activeElement = f.last; keyDown({ key: 'Tab', shiftKey: false, preventDefault() {} })
    assert.equal(f.focused.at(-1), 'first')
    f.desktop.matches = true; f.desktop.listener(); assert.equal(closed, 1)
  } finally { f.cleanup() }
})

test('normal close animates once for 180ms and an unmount cancels its timer', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const f = await fixture(); let closed = 0
  const onClose = () => closed++
  try {
    let view = f.view(onClose); f.runtime.effects()
    const button = findElement(view, node => node.type === 'button')
    button.props.onClick(); button.props.onClick()
    view = f.view(onClose)
    assert.match(view.props.children.props.className, /is-closing/)
    assert.equal(closed, 0)
    context.mock.timers.tick(179); assert.equal(closed, 0)
    context.mock.timers.tick(1); assert.equal(closed, 1)
  } finally { f.cleanup() }
  const second = await fixture()
  try {
    const view = second.view(onClose); second.runtime.effects()
    findElement(view, node => node.type === 'button').props.onClick()
    second.runtime.cleanup(); context.mock.timers.tick(180)
    assert.equal(closed, 1, 'unmount must not leave a delayed state update')
  } finally { second.cleanup() }
})

test('opening More removes Orders highlight; nested More pages highlight only More', async () => {
  for (const pathname of ['/admin/orders', '/admin/menu', '/admin/menu/123']) {
    const f = await fixture({ pathname })
    try {
      let view = f.runtime.render(f.Nav); f.runtime.effects()
      const links = () => findElement(view, node => node.type === 'NavLink' && node.props.to === '/admin/orders')
      let more = findElement(view, node => node.type === 'button')
      if (pathname.includes('/menu')) {
        assert.match(more.props.className, /bg-orange-50/)
        assert.doesNotMatch(links().props.className({ isActive: true }), /bg-orange-50/)
      }
      more.props.onClick(); view = f.runtime.render(f.Nav)
      more = findElement(view, node => node.type === 'button')
      assert.equal(more.props['aria-expanded'], true); assert.equal(more.props['aria-haspopup'], 'dialog')
      assert.doesNotMatch(links().props.className({ isActive: true }), /bg-orange-50/)
    } finally { f.cleanup() }
  }
})
