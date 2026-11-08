import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCustomerVisitStorage } from '../src/utils/customerVisitStorage.js'
import { menuRestoreTop, normalizeMenuBrowse } from '../src/utils/menuBrowseState.js'
import { memoryStorage, hookRuntime, bundleHarness } from './helpers/hookHarness.mjs'

const session = { sessionId: '66b195a3-18e0-4f2d-a337-42797a0ba97f', tableSessionId: 'a98b5086-dff8-4aca-b8a7-f42459604745', tableNumber: '1', customerNickname: 'Guest' }
const next = { ...session, tableSessionId: '5cf5273f-02fb-49d1-a40e-00a85648b5fa' }
const state = { searchTerm: 'chicken', category: 'rice', popularOnly: true, scrollY: 555, anchorId: 'rice-1', anchorTop: 144 }

test('menu search, popular mode and anchor survive same-visit reload but never another visit or late cleanup', () => {
  const native = memoryStorage(), storage = createCustomerVisitStorage({ getStorage: () => native })
  storage.saveSession(session); storage.saveMenuBrowse(session, state)
  assert.deepEqual(createCustomerVisitStorage({ getStorage: () => native }).readMenuBrowse(session), state)
  storage.saveSession(next); storage.saveMenuBrowse(session, state)
  assert.deepEqual(storage.readMenuBrowse(next), normalizeMenuBrowse(null))
  storage.saveSession(session)
  assert.deepEqual(storage.readMenuBrowse(session), normalizeMenuBrowse(null))
  storage.saveMenuBrowse(session, state); storage.clearSession(); storage.saveMenuBrowse(session, state)
  assert.deepEqual(storage.readMenuBrowse(session), normalizeMenuBrowse(null))
})

test('menu storage safely bounds invalid data and works in memory when browser storage is denied', () => {
  const storage = createCustomerVisitStorage({ getStorage: () => { throw new Error('Denied') } })
  storage.saveSession(session); storage.saveMenuBrowse(session, { ...state, scrollY: Infinity, anchorTop: NaN, searchTerm: 'x'.repeat(300) })
  const restored = storage.readMenuBrowse(session)
  assert.equal(restored.scrollY, 0); assert.equal(restored.anchorTop, 0); assert.equal(restored.searchTerm.length, 200)
  assert.equal(menuRestoreTop(state, 240, 100), 196)
  assert.equal(menuRestoreTop(state, undefined, 0), 555)
})

test('real browse hook waits for menu data, restores once and saves captured position instead of next-page scroll', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window'), events = new Map(), calls = []
  const browser = { sessionStorage: memoryStorage(), scrollY: 0, addEventListener: (type, handler) => events.set(type, handler), removeEventListener: type => events.delete(type), scrollTo: options => { calls.push(options); browser.scrollY = options.top } }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser })
  const runtime = hookRuntime()
  try {
    const h = await bundleHarness(`import useMenuBrowse from './src/hooks/useMenuBrowse.js';export {customerVisitStorage as storage} from './src/utils/customerVisitStorage.js';export const View=props=>useMenuBrowse(props.session,props.ready)`, runtime)
    h.storage.saveSession(session); h.storage.saveMenuBrowse(session, state)
    const row = { dataset: { menuItem: 'rice-1' }, getClientRects: () => [1], getBoundingClientRect: () => ({ top: 240, bottom: 340 }) }
    const view = ready => runtime.render(h.View, { session, ready })
    let result = view(false); result.root.current = { isConnected: true, querySelectorAll: () => [row] }; runtime.effects()
    assert.equal(calls.length, 0)
    result = view(true); runtime.effects()
    assert.equal(calls[0].top, 96)
    events.get('scroll')()
    browser.scrollY = 0 // Next page reset occurs before old page cleanup.
    runtime.cleanup()
    assert.equal(h.storage.readMenuBrowse(session).scrollY, 96)
    view(true); runtime.effects(); assert.equal(calls.length, 1)
  } finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window }
})
