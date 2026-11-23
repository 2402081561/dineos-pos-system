import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

test('concise headings remove unused spacing but preserve identity, guidance and actions', async () => {
  const runtime = hookRuntime()
  const { Heading } = await bundleHarness("export {default as Heading} from './src/components/common/SectionHeading.jsx'", runtime, {
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
  })
  const action = { type: 'button', props: { children: 'Add dish' } }
  const simple = runtime.render(Heading, { title: 'Manage menu', action })
  assert.equal(findElement(simple, node => node.type === 'p'), null)
  assert(!findElement(simple, node => node.type === 'h1').props.className.includes('mt-1'))
  assert.equal(findElement(simple, node => node.type === 'button'), action)
  const contextual = runtime.render(Heading, { title: 'Table summary', eyebrow: 'Table 2', description: 'Whole table unpaid amount' })
  assert(findElement(contextual, node => node.props.children === 'Table 2'))
  assert(findElement(contextual, node => node.props.children === 'Whole table unpaid amount'))
  assert(findElement(contextual, node => node.type === 'h1').props.className.includes('mt-1'))
})

for (const hasSession of [false, true]) test(`landing keeps real shop name and original entry route (session=${hasSession})`, async () => {
  const runtime = hookRuntime()
  const { Landing } = await bundleHarness("export {default as Landing} from './src/pages/customer/Landing.jsx'", runtime, {
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
    useShopSettings: 'export default ()=>({name:"Test Restaurant"})',
    useCustomerSession: `export default ()=>({session:${hasSession ? '{tableNumber:2,customerNickname:"Guest"}' : 'null'}})`,
    'react-router-dom': 'export const Link="a"',
    BrandMark: 'export default function BrandMark(){return null}',
    Button: 'export default function Button(){return null}',
  })
  const tree = runtime.render(Landing)
  assert.equal(findElement(tree, node => node.type === 'h1').props.children, 'Test Restaurant')
  assert.equal(findElement(tree, node => node.type === 'a').props.to, hasSession ? '/menu' : '/join')
  assert(!JSON.stringify(tree).includes('Good food.'))
})

test('operational warnings are retained rather than globally hiding descriptions', () => {
  const read = file => readFileSync(new URL(`../src/pages/${file}`, import.meta.url), 'utf8')
  assert(read('admin/AuditLog.jsx').includes('latest 100 records'))
  assert(read('admin/ShopSettings.jsx').includes('Saved receipts keep their original shop details and charges.'))
  assert(read('customer/TableSummary.jsx').includes('This is the whole table’s unpaid amount, not one person’s bill.'))
  assert(read('admin/Login.jsx').includes('onSubmit={handleSubmit}'))
  assert(read('admin/Login.jsx').includes('disabled={isLoading}'))
  assert(!read('admin/Login.jsx').includes('· Control Centre'))
})
