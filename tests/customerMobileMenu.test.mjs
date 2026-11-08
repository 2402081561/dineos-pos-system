import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

const food = { id: 'rice', name: '奶油鸡饭 Butter Chicken Rice', price: 9, isAvailable: true, optionGroups: [] }
async function harness() {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Item} from './src/components/customer/MobileMenuItem.jsx'; export {fixture} from 'mobile-menu-fixture'`, runtime, {
    'mobile-menu-fixture': 'export const fixture={items:[],locked:false,busy:false,added:[],updates:[],navigation:[]}',
    useCustomerLanguage: 'export default ()=>({t:(text,options={})=>text.replace(/{{(\\w+)}}/g,(match,key)=>options[key]??match)})',
    useCart: `import {fixture} from 'mobile-menu-fixture';export default ()=>({cartItems:fixture.items,isCartLocked:fixture.locked,updateQuantity:(...args)=>fixture.updates.push(args)})`,
    useAddToCartFeedback: `import {fixture} from 'mobile-menu-fixture';export default ()=>({addItem:(...args)=>fixture.added.push(args),isBusy:fixture.busy||fixture.locked,isAdding:false})`,
    'react-router-dom': `import {fixture} from 'mobile-menu-fixture';export const Link=()=>null;export const useNavigate=()=>path=>fixture.navigation.push(path)`,
  })
  const view = (item = food) => runtime.render(h.Item, { food: item })
  const button = (label, item) => findElement(view(item), (node) => node.type === 'button' && node.props['aria-label'] === label)
  return { ...h, runtime, view, button }
}

test('mobile ordinary dish adds through the existing cart hook; simple minus changes only its exact line', async () => {
  const h = await harness()
  try {
    h.button('Add one ' + food.name).props.onClick()
    assert.deepEqual(h.fixture.added, [[food]])
    h.fixture.items = [{ menuItemId: 'rice', cartItemId: 'dine-in-row', quantity: 2, selections: [], orderType: 'dine_in' }]
    assert.ok(findElement(h.view(), (node) => node.props?.['aria-label'] === 'In cart: 2'))
    h.button('Decrease ' + food.name).props.onClick()
    assert.deepEqual(h.fixture.updates, [['dine-in-row', 1]])
  } finally { h.runtime.cleanup() }
})

test('mobile minus sends mixed packing, custom notes and options to the cart without silently deleting portions', async () => {
  const h = await harness()
  try {
    const base = { menuItemId: 'rice', cartItemId: 'row', quantity: 1 }
    for (const items of [[{ ...base, orderType: 'take_away' }], [{ ...base, specialInstructions: 'No onion' }], [{ ...base, selections: [{ groupId: 'size', optionIds: ['large'] }] }], [base, { ...base, cartItemId: 'other', orderType: 'take_away' }]]) {
      h.fixture.items = items
      h.button('Decrease ' + food.name).props.onClick()
    }
    assert.equal(h.fixture.navigation.length, 4)
    assert.ok(h.fixture.navigation.every((path) => path === '/cart'))
    assert.deepEqual(h.fixture.updates, [])
  } finally { h.runtime.cleanup() }
})

test('options use the existing detail route, sold-out dishes cannot add, and an uncertain order locks both controls', async () => {
  const h = await harness()
  try {
    const configurable = { ...food, optionGroups: [{ id: 'size' }] }
    h.button('Choose options for ' + food.name, configurable).props.onClick()
    assert.deepEqual(h.fixture.navigation, ['/menu/rice'])
    assert.deepEqual(h.fixture.added, [])
    assert.equal(h.button('Add one ' + food.name, { ...food, isAvailable: false }), null)
    h.fixture.items = [{ menuItemId: 'rice', cartItemId: 'row', quantity: 1 }]
    h.fixture.locked = true
    assert.equal(h.button('Add one ' + food.name).props.disabled, true)
    assert.equal(h.button('Decrease ' + food.name).props.disabled, true)
    h.button('Decrease ' + food.name).props.onClick()
    assert.deepEqual(h.fixture.updates, [])
  } finally { h.runtime.cleanup() }
})

test('desktop category/search behaviour stays unchanged while mobile receives the complete menu', async () => {
  const runtime = hookRuntime()
  const h = await bundleHarness(`export {default as Menu} from './src/pages/customer/Menu.jsx';export {fixture} from 'mobile-menu-state'`, runtime, {
    'mobile-menu-state': `export const fixture={categories:[{id:'rice',name:'饭类 Rice'},{id:'drinks',name:'Drinks'}],menuItems:[{id:'first',categoryId:'rice',name:'Rice A',isAvailable:true},{id:'second',categoryId:'drinks',name:'Tea',isAvailable:true},{id:'third',categoryId:'rice',name:'Rice B',isAvailable:false}],popularItems:[],isLoading:false,error:''}`,
    useCustomerLanguage: 'export default ()=>({t:text=>text})',
    useCustomerSession: 'export default ()=>({session:{tableNumber:1}})',
    useMenu: `import {fixture} from 'mobile-menu-state';export default ()=>fixture`,
  })
  const view = () => { const content = runtime.render(h.Menu); return runtime.render(content.type, content.props) }
  const ids = () => {
    const items = []
    const collect = (node) => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(collect); if (node.type?.name === 'FoodCard') items.push(node.props.food.id); Object.values(node.props ?? {}).forEach(collect) }
    collect(view())
    return items
  }
  try {
    view();runtime.effects()
    assert.deepEqual(ids(), ['first','second','third'])
    findElement(view(), node => node.props?.role === 'tab' && node.props.children.at(-1) === '饭类 Rice').props.onClick()
    assert.deepEqual(ids(), ['first','third'])
    const mobile=findElement(view(),node=>node.type?.name==='MobileMenuSections')
    assert.equal(mobile.props.menuItems.length,3)
    findElement(view(), node => node.props?.id === 'mobile-menu-search').props.onChange({target:{value:'B'}})
    assert.deepEqual(ids(), ['third'])
    assert.equal(findElement(view(),node=>node.type?.name==='MobileMenuSections').props.searchTerm,'B')
    findElement(view(), node => node.props?.id === 'mobile-menu-search').props.onChange({target:{value:''}})
    h.fixture.categories = [{id:'drinks',name:'Drinks'}]
    view();runtime.effects()
    assert.deepEqual(ids(), ['first','second','third'])
  } finally {runtime.cleanup()}
})
