import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

test('retired service URL redirects without rendering forms, requests or login actions', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness("export {default as Page} from './src/pages/customer/ServiceRequests.jsx'", runtime)
  const tree = runtime.render(h.Page)
  assert.equal(tree.props.to, '/more')
  assert.equal(tree.props.replace, true)
  const source = readFileSync(new URL('../src/pages/customer/ServiceRequests.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /createCustomerServiceRequest|useCustomerServiceRequests|onClick/)
})

test('More reserves the guest account area without service actions or a premature login form', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness("export {default as More} from './src/pages/customer/More.jsx';export {fixture} from 'account-placeholder-fixture'", runtime, {
    'account-placeholder-fixture': 'export const fixture={session:{tableNumber:1}}',
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
    useCustomerSession: "import {fixture} from 'account-placeholder-fixture';export default ()=>({session:fixture.session})",
  })
  try {
    let tree = runtime.render(h.More)
    assert.ok(findElement(tree, node => node.props?.children === 'Customer accounts will be available here later.'))
    assert.equal(findElement(tree, node => node.props?.to === '/service-requests'), null)
    assert.equal(findElement(tree, node => node.type === 'form' || node.type === 'input' || node.type === 'button'), null)
    h.fixture.session = {tableNumber:1,memberId:'existing-member'}
    tree = runtime.render(h.More)
    assert.ok(findElement(tree, node => node.props?.to === '/member'))
    assert.ok(findElement(tree, node => node.props?.to === '/rewards'))
    assert.equal(findElement(tree, node => node.props?.to === '/service-requests'), null)
  } finally { runtime.cleanup() }
})

test('customer navigation keeps bill viewing, but no bill-request destination or API action', () => {
  const layout = readFileSync(new URL('../src/layouts/CustomerLayout.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(layout, /label: 'Request bill'|to: '\/bill'/)
  assert.match(layout, /to: '\/table-summary'/)
  const bill = readFileSync(new URL('../src/pages/customer/Bill.jsx', import.meta.url), 'utf8')
  assert.match(bill, /<Navigate replace to="\/table-summary"/)
  assert.doesNotMatch(bill, /createCustomerServiceRequest|onClick|<Button/)
})
