import assert from 'node:assert/strict'
import test from 'node:test'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

test('order type icons use local scalable plate/bag artwork and keep mixed orders distinct', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Icon} from './src/components/common/OrderTypeIcon.jsx';export {default as Badge} from './src/components/common/OrderTypeBadge.jsx';export {default as Selector} from './src/components/common/OrderTypeSelector.jsx'`, runtime, {
    useCustomerLanguage: 'export default ()=>({t:value=>value})',
  })
  const dine = runtime.render(h.Icon, { orderType: 'dine_in' })
  const away = runtime.render(h.Icon, { orderType: 'take_away' })
  assert.equal(dine.type, 'svg'); assert.equal(away.type, 'svg')
  for (const icon of [dine, away]) {
    assert.equal(icon.props['aria-hidden'], 'true')
    assert.equal(icon.props.focusable, 'false')
    assert.equal(icon.props.stroke, 'currentColor')
    assert.match(icon.props.className, /h-4 w-4/)
  }
  assert.ok(findElement(dine, element => element.type === 'circle'))
  assert.equal(findElement(away, element => element.type === 'circle'), null)
  const mixed = runtime.render(h.Icon, { orderType: 'mixed' })
  assert.deepEqual(mixed.props.children.map(child => child.props.orderType), ['dine_in', 'take_away'])
  for (const type of ['dine_in', 'take_away', 'mixed']) {
    const badge = runtime.render(h.Badge, { orderType: type })
    assert.equal(findElement(badge, element => element.type === h.Icon).props.orderType, type)
    assert.ok(badge.props.children.some(child => typeof child === 'string' && child.length))
    assert.doesNotMatch(JSON.stringify(badge), /▣|●/)
  }
  const changes = []
  const selector = runtime.render(h.Selector, { value: 'dine_in', disabled: true, onChange: type => changes.push(type) })
  assert.equal(selector.props.disabled, true)
  const selected = findElement(selector, element => element.type === 'input' && element.props.value === 'dine_in')
  const takeaway = findElement(selector, element => element.type === 'input' && element.props.value === 'take_away')
  assert.equal(selected.props.checked, true)
  assert.equal(takeaway.props.checked, false)
  takeaway.props.onChange()
  assert.deepEqual(changes, ['take_away'])
})
