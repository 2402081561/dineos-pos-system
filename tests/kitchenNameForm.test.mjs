import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

test('actual menu editor retains and submits kitchen aliases without changing the customer dish name', async () => {
  const previousDocument = globalThis.document
  globalThis.document = { body: {} }
  const runtime = hookRuntime()
  try {
    const { Form } = await bundleHarness(`export {default as Form} from './src/components/admin/MenuItemFormModal.jsx'`, runtime, {
      'react-dom': 'export const createPortal=(children)=>children',
      useCustomerLanguage: 'export default ()=>({t:(text)=>text})',
    })
    const saved = []
    const originalName = '广东粿条 Cantonese Kueh Teow'
    const props = { initialItem: { id: 'dish', name: originalName, kitchenName: 'cont kt', imageUrl: 'https://example.com/dish.jpg' }, categories: [], onSubmit: (value) => saved.push(value) }
    const render = () => runtime.render(Form, props)
    const input = findElement(render(), (node) => node.type === 'input' && node.props.maxLength === 40)
    assert.equal(input.props.value, 'cont kt')
    input.props.onChange({ target: { value: '广东粿条' } })
    findElement(render(), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.equal(saved[0].kitchenName, '广东粿条')
    assert.equal(saved[0].name, originalName)
    input.props.onChange({ target: { value: '' } })
    findElement(render(), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.equal(saved[1].kitchenName, '')
  } finally {
    runtime.cleanup()
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})
