import { resolveOptions, roundMoney } from '../../server/src/posRules.js'
import { cartLineId } from './cartOrderType.js'

export function cartItemFingerprint(item) {
  return JSON.stringify([item?.cartRowId, item?.cartItemId, item?.quantity, item?.specialInstructions ?? '', item?.selections ?? [], item?.orderType ?? 'dine_in'])
}

// Replace one exact row atomically. Matching variants merge without adding an
// extra copy, moving unrelated rows, or losing the existing row's identity.
export function editCartRow(items, rowId, expected, menuItem, values) {
  const source = items.find((item) => item.cartRowId === rowId)
  if (!source || cartItemFingerprint(source) !== expected) throw new Error('This cart item changed. Close the editor and try again.')
  const quantity = Number(values.quantity)
  const notes = String(values.specialInstructions ?? '').trim()
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50 || notes.length > 300 || !['dine_in', 'take_away'].includes(values.orderType)) throw new Error('Please review the dish options and quantity.')
  if (menuItem?.id !== source.menuItemId || menuItem.isAvailable !== true || !String(menuItem.name ?? '').trim() || !Number.isFinite(Number(menuItem.price)) || Number(menuItem.price) < 0) throw new Error('This item is currently unavailable and cannot be added to your cart.')
  const options = resolveOptions(menuItem.optionGroups ?? [], values.selections ?? [])
  const id = cartLineId(menuItem.id, notes, options.selections, values.orderType)
  const target = items.find((item) => item.cartItemId === id && item.cartRowId !== rowId)
  if (quantity + (target?.quantity ?? 0) > 50) throw new Error('Each item line can contain at most 50 items.')
  const edited = { ...source, name: menuItem.name, imageUrl: menuItem.imageUrl, cartItemId: id, quantity, specialInstructions: notes, selections: options.selections, optionSnapshot: options.optionSnapshot, orderType: values.orderType, unitPrice: roundMoney(Number(menuItem.price) + options.extraPrice) }
  return items.flatMap((item) => item.cartRowId === rowId ? target ? [] : [edited] : item === target ? [{ ...edited, cartRowId: target.cartRowId, quantity: target.quantity + quantity }] : [item])
}
