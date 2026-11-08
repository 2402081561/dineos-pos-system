import { test } from 'node:test'
import assert from 'node:assert/strict'
import { menuDescription } from '../src/utils/menuDescription.js'
import { bundleHarness, hookRuntime, findElement } from './helpers/hookHarness.mjs'

test('description display hides empty and dash-only values, not meaningful text or punctuation', () => {
  for (const value of [undefined,null,12,{},'', ' \n\t ', '-', ' — ', '–', ' -- ', '— - –']) assert.equal(menuDescription(value), '')
  for (const value of ['酸和微辣', 'Sweet-and-sour', '- less spicy', '3–4 flavours', '—招牌口味', '<b>Fresh</b>']) assert.equal(menuDescription(`  ${value}  `),value)
  const food=Object.freeze({description:' - '})
  menuDescription(food.description)
  assert.equal(food.description,' - ')
})

test('mobile rows, desktop cards and food details omit placeholder paragraphs and keep genuine descriptions', async () => {
  const runtime=hookRuntime()
  const h=await bundleHarness(`export {default as Mobile} from './src/components/customer/MobileMenuItem.jsx';export {default as Card} from './src/components/customer/FoodCard.jsx';export {default as Details} from './src/pages/customer/FoodDetails.jsx';export {fixture} from 'description-fixture'`,runtime,{
    'description-fixture':`export const fixture={food:{id:'rice',name:'Rice',price:9,isAvailable:true,optionGroups:[],description:'-'}}`,
    useCustomerLanguage:`export default ()=>({t:text=>text})`,
    useCart:`export default ()=>({cartItems:[],isCartLocked:false,updateQuantity(){}})`,
    useAddToCartFeedback:`export default ()=>({isBusy:false,addItem(){}})`,
    useMenuItem:`import {fixture} from 'description-fixture';export default ()=>({menuItem:fixture.food,category:{name:'Rice'},isLoading:false,error:''})`,
    usePreparationEstimate:`export default ()=>({label:'3–4 mins'})`,
    useShopSettings:`export default ()=>({settings:{isAcceptingOrders:true},isLoading:false,error:''})`,
    'react-router-dom':`export const useParams=()=>({itemId:'rice'});export const useNavigate=()=>()=>{};export const Link=()=>null`,
  })
  const views=()=>[runtime.render(h.Mobile,{food:h.fixture.food}),runtime.render(h.Card,{food:h.fixture.food}),runtime.render(runtime.render(h.Details).type)]
  try {
    for(const description of ['', ' \n ', '-', ' — ', '–']){
      h.fixture.food.description=description
      for(const view of views()){
        assert.equal(findElement(view,node=>node.type==='p'&&typeof node.props.children==='string'&&(/^[-–—\s]*$/u.test(node.props.children)||node.props.children==='No description is available for this item.')),null)
      }
    }
    h.fixture.food.description='  Fresh - less spicy  '
    for(const view of views()) assert.ok(findElement(view,node=>node.type==='p'&&node.props.children==='Fresh - less spicy'))
    assert.equal(h.fixture.food.description,'  Fresh - less spicy  ','Rendering does not rewrite saved food data')
  } finally {runtime.cleanup()}
})
