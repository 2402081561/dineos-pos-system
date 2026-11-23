import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

for (const language of ['en', 'zh']) test(`kitchen heading is concise without removing queue or sound controls (${language})`, async () => {
  const runtime = hookRuntime()
  const translations = language === 'zh' ? {
    'Incoming orders': '待处理订单', '▶ Test sound': '▶ 测试声音',
    '🔔 Sound on': '🔔 声音开启', 'Filter kitchen orders': '筛选厨房订单',
  } : {}
  const h = await bundleHarness("export {default as Dashboard} from './src/pages/kitchen/Dashboard.jsx';export {default as Heading} from './src/components/common/SectionHeading.jsx'", runtime, {
    useCustomerLanguage: `const labels=${JSON.stringify(translations)};export default ()=>({t:text=>labels[text]??text})`,
    useKitchenOrders: "export default ()=>({orders:[{id:'test-order',status:'received'}],isLoading:false,error:'',newOrderIds:new Set(),refresh(){}})",
    adminApiService: 'export function updateSupabaseKitchenOrderStatus(){throw new Error("No API access allowed in heading test")}',
    PrintableKitchenOrderCard: 'export default function KitchenCard(){return null}',
  })
  // Do not execute effects: no timers, audio or network activity are needed.
  const dashboard = runtime.render(h.Dashboard)
  const heading = findElement(dashboard, node => node.type === h.Heading)
  assert(heading)
  assert.equal(heading.props.eyebrow, undefined)
  assert.equal(heading.props.description, undefined)
  assert.equal(heading.props.title, translations['Incoming orders'] ?? 'Incoming orders')
  const rendered = runtime.render(h.Heading, heading.props)
  assert.equal(findElement(rendered, node => node.type === 'h1').props.children, heading.props.title)
  assert.equal(findElement(rendered, node => node.type === 'p'), null)
  for (const label of ['▶ Test sound', '🔔 Sound on']) {
    const button = findElement(rendered, node => node.type === 'button' && node.props.children === (translations[label] ?? label))
    assert.equal(typeof button?.props.onClick, 'function')
  }
  assert(findElement(dashboard, node => node.type === 'nav' && node.props['aria-label'] === (translations['Filter kitchen orders'] ?? 'Filter kitchen orders')))
})
