import assert from 'node:assert/strict'
import test from 'node:test'
import { bundleHarness, hookRuntime, findElement, flush } from './helpers/hookHarness.mjs'

test('price editor keeps decimal typing and submits fifty sen without losing hidden legacy fields', async () => {
  const previous = globalThis.document
  globalThis.document = { body: {} }
  const runtime = hookRuntime()
  try {
    const h = await bundleHarness(`export {default as Form} from './src/components/admin/MenuItemFormModal.jsx';export {default as Money} from './src/components/common/MoneyInput.jsx';export {default as Options} from './src/components/admin/OptionGroupEditor.jsx'`, runtime, {
      'react-dom': 'export const createPortal=children=>children', useCustomerLanguage: 'export default ()=>({t:text=>text})',
    })
    const saved = []
    const props = { categories: [], initialItem: { id: 'dish', price: 9, ingredients: ['Egg'], allergyInformation: ['Milk'], optionGroups: [{ id: 'g', name: 'Meat', min: 0, max: 1, options: [{ id: 'o', label: 'Pork', price: 0, isAvailable: true }] }] }, onSubmit: item => saved.push(item) }
    const render = () => runtime.render(h.Form, props)
    assert.equal(findElement(render(), element => element.type === h.Money).props.value, '9')
    assert.doesNotMatch(JSON.stringify(render()), /comma-separated|Allergy information|Ingredients/)
    for (const text of ['', '0', '0.', '0.5', '0.50']) {
      const price = findElement(render(), element => element.type === h.Money)
      const input = runtime.render(h.Money, price.props)
      assert.equal(input.props.type, 'text'); assert.equal(input.props.inputMode, 'decimal')
      input.props.onChange({ target: { value: text } })
      assert.equal(findElement(render(), element => element.type === h.Money).props.value, text)
    }
    const options = findElement(render(), element => element.type === h.Options)
    const groupView = runtime.render(h.Options, options.props)
    const extra = findElement(groupView, element => element.type === h.Money)
    runtime.render(h.Money, extra.props).props.onChange({ target: { value: '0.50' } })
    findElement(render(), element => element.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.equal(saved[0].price, '0.50')
    assert.equal(saved[0].optionGroups[0].options[0].price, 0.5)
    assert.deepEqual(saved[0].ingredients, ['Egg']); assert.deepEqual(saved[0].allergyInformation, ['Milk'])
    assert.equal(props.initialItem.optionGroups[0].options[0].price, 0, 'Editing does not mutate the current menu snapshot')
  } finally { runtime.cleanup(); globalThis.document = previous }
})

test('a confirmed saved price is visible immediately and an older poll cannot overwrite it', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as useMenu} from './src/hooks/useAdminMenu.js';export {fixture} from 'menu-price-fixture'`, runtime, {
    'menu-price-fixture': 'export const fixture={reads:0};',
    supabaseAuthService: `import {fixture} from 'menu-price-fixture';export function authenticatedApiRequest(path){if(path.endsWith('categories'))return Promise.resolve({categories:[]});fixture.reads++;if(fixture.reads===1)return new Promise(resolve=>{fixture.old=resolve});return Promise.resolve({items:[{id:'dish',price:'9.50'}]})}`,
  })
  try {
    const view = () => runtime.render(h.useMenu)
    view(); runtime.effects(); await flush()
    view().applySavedItem({ id: 'dish', price: '9.50' })
    assert.equal(view().menuItems[0].price, '9.50')
    h.fixture.old({ items: [{ id: 'dish', price: '8.00' }] }); await flush()
    assert.equal(view().menuItems[0].price, '9.50')
    assert.equal(h.fixture.reads, 2)
  } finally { runtime.cleanup() }
})
