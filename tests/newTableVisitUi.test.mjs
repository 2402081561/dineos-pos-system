import assert from 'node:assert/strict'
import test from 'node:test'
import { bundleHarness, hookRuntime, flush, findElement } from './helpers/hookHarness.mjs'

test('guest new-table entry is explicit, does not activate on conflict and reuses confirmation identity after lost response', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Join} from './src/pages/customer/JoinSession.jsx';export {fixture} from 'new-visit-fixture'`, runtime, {
    'new-visit-fixture': `export const fixture={calls:[],navigation:[],activated:[],cleared:0,fail:true};`,
    'react-router-dom': `import {fixture} from 'new-visit-fixture';export function useNavigate(){return (...args)=>fixture.navigation.push(args)};export function useSearchParams(){return [new URLSearchParams('table=1')]};`,
    useCustomerLanguage: 'export default ()=>({t:value=>value})',
    useShopSettings: "export default ()=>({name:'Local preview'})",
    useMemberEmailAvailability: 'export default ()=>({enabled:false,isLoading:false})',
    useCustomerSession: `import {fixture} from 'new-visit-fixture';export default ()=>({session:null,startSession:(...args)=>fixture.activated.push(args),clearSession:()=>fixture.cleared++})`,
    MemberEmailAuth: 'export default ()=>null',
    tableSessionService: `import {fixture} from 'new-visit-fixture';export async function joinTableSession(input){fixture.calls.push(input);if(!input.newVisit)throw Object.assign(new Error('Previous bill settled'),{newTableRequired:true,expectedTableSessionId:'11111111-1111-4111-8111-111111111111'});if(fixture.fail)throw new TypeError('Response lost');return {tableSessionId:input.newVisit.newTableSessionId,sessionId:'new-token',isSharedTable:true}}`,
  })
  const view = () => runtime.render(h.Join)
  const action = text => findElement(view(), element => element.props?.children === text && typeof element.props.onClick === 'function')
  try {
    await action('Continue as Guest').props.onClick(); await flush()
    assert.equal(h.fixture.calls.length, 1)
    assert.equal(h.fixture.activated.length, 0)
    assert.ok(findElement(view(), element => element.props?.['aria-label'] === 'Start a new table?'))
    await action('Start new table').props.onClick(); await flush()
    assert.equal(h.fixture.activated.length, 0, 'An ambiguous response never activates or replays automatically')
    const first = h.fixture.calls[1].newVisit
    h.fixture.fail = false
    await action('Start new table').props.onClick(); await flush()
    assert.deepEqual(h.fixture.calls[2].newVisit, first, 'Explicit retry uses the same visit identity')
    assert.equal(h.fixture.activated.length, 1)
    assert.equal(h.fixture.navigation[0][0], '/menu')
    assert.equal(h.fixture.cleared, 0)
  } finally { runtime.cleanup() }
})
