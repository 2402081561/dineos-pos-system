import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateStoreConfig } from '../server/src/posRules.js'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

test('restaurant mini-game setting defaults off and requires a boolean', () => {
  assert.equal(validateStoreConfig({}).miniGameEnabled, false)
  assert.equal(validateStoreConfig({ miniGameEnabled: true }).miniGameEnabled, true)
  assert.throws(() => validateStoreConfig({ miniGameEnabled: 'true' }))
})

test('direct game route only mounts the game when the restaurant enables it', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness("export {default as Game} from './src/pages/customer/CatchIngredients.jsx'; export {fixture} from './src/hooks/useShopSettings'", runtime, {
    useShopSettings: 'export const fixture={config:{miniGameEnabled:false}};export default ()=>fixture',
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
  })
  const game = () => findElement(runtime.render(h.Game), n => n.type?.name === 'CatchRound')
  assert.equal(game(), null)
  h.fixture.config.miniGameEnabled = true
  const round = game()
  assert(round)
  const board = runtime.render(round.type, round.props)
  assert(findElement(board, n => n.type === 'button' && n.props.children === 'Start game'))
  h.fixture.error = 'offline'
  assert.equal(game(), null)
})
