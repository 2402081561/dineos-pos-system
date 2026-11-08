// Pure rules shared by the API and browser. Prices/permissions are always
// revalidated by the API; a browser preview is never trusted as a bill.
import { defaultKitchenConfig } from './kitchenEstimate.js'
export class PosValidationError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
export const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100
export const defaultConfig = {
  ...defaultKitchenConfig,
  logoUrl: '', address: '', phone: '', receiptFooter: 'Thank you! Please come again.',
  acceptingOrders: true, enforceOpeningHours: false, requireHandoffConfirmation: true, takeawayQrEnabled: false, serviceChargeRate: 10, sstRate: 6,
  openingHours: Array.from({ length: 7 }, (_, day) => ({ day, closed: false, open: '09:00', close: '22:00' })),
}
function text(value, max, field, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || Array.from(value).some((character) => { const code = character.charCodeAt(0); return code < 32 && code !== 9 && code !== 10 || code >= 127 && code <= 159 }) || (required && !value.trim())) throw new PosValidationError(`${field} is invalid (maximum ${max} characters).`)
  return value.trim()
}
function amount(value, max = 999999.99) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '' || !/^\d+(\.\d{1,2})?$/.test(String(value).trim())) throw new PosValidationError('Enter a non-negative amount with up to 2 decimal places.')
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed > max) throw new PosValidationError('The amount is outside the allowed range.')
  return parsed
}
export function validateStoreConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !Object.hasOwn(defaultConfig, key))) throw new PosValidationError('Invalid shop configuration.')
  const config = { ...defaultConfig, ...input }
  for (const [field, max] of [['logoUrl', 2000], ['address', 300], ['phone', 40], ['receiptFooter', 300]]) config[field] = text(config[field], max, field)
  if (config.logoUrl) { let url; try { url = new URL(config.logoUrl) } catch { /* validated below */ } if (url?.protocol !== 'https:' || url.username || url.password) throw new PosValidationError('Logo must be an HTTPS image URL without credentials.') }
  for (const field of ['acceptingOrders', 'enforceOpeningHours', 'requireHandoffConfirmation', 'takeawayQrEnabled']) if (typeof config[field] !== 'boolean') throw new PosValidationError(`${field} must be true or false.`)
  for (const field of ['serviceChargeRate', 'sstRate']) config[field] = amount(config[field], 100)
  for (const [field, max] of [['kitchenCapacity', 20], ['preparationMinMinutes', 120], ['preparationMaxMinutes', 120]]) {
    config[field] = amount(config[field], max)
    if (!Number.isInteger(config[field]) || config[field] < 1) throw new PosValidationError('Kitchen capacity and preparation minutes must be positive whole numbers.')
  }
  if (config.preparationMaxMinutes < config.preparationMinMinutes) throw new PosValidationError('Maximum preparation time must not be less than the minimum.')
  if (!Array.isArray(config.openingHours) || config.openingHours.length !== 7) throw new PosValidationError('Set opening hours for all 7 days.')
  config.openingHours = config.openingHours.map((entry, day) => {
    if (entry?.day !== day || typeof entry.closed !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.close) || (!entry.closed && entry.open === entry.close)) throw new PosValidationError('Opening and closing times must be valid and different. Overnight hours are supported.')
    return { day, closed: entry.closed, open: entry.open, close: entry.close }
  })
  return config
}
export function orderingAvailability(config, now = new Date()) {
  if (config.acceptingOrders === false) return { isAcceptingOrders: false, orderingMessage: 'QR ordering is paused. Please ask our staff to order.' }
  if (!config.enforceOpeningHours) return { isAcceptingOrders: true, orderingMessage: '' }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kuching', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(({ type, value }) => [type, value]))
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  const minute = Number(parts.hour) * 60 + Number(parts.minute)
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const today = config.openingHours[day], previous = config.openingHours[(day + 6) % 7]
  const open = today && !today.closed && (minutes(today.open) < minutes(today.close) ? minute >= minutes(today.open) && minute < minutes(today.close) : minute >= minutes(today.open))
  const overnight = previous && !previous.closed && minutes(previous.open) > minutes(previous.close) && minute < minutes(previous.close)
  return { isAcceptingOrders: Boolean(open || overnight), orderingMessage: open || overnight ? '' : 'QR ordering is outside our opening hours. Please ask our staff.' }
}
const keyPattern = /^[a-zA-Z0-9_-]{1,64}$/
export function validateOptionGroups(input = []) {
  if (!Array.isArray(input) || input.length > 10) throw new PosValidationError('A dish can have up to 10 option groups.')
  const ids = new Set()
  return input.map((group) => {
    if (typeof group?.id !== 'string' || !keyPattern.test(group.id) || ids.has(group.id)) throw new PosValidationError('Option groups need unique IDs.')
    ids.add(group.id)
    if (!Number.isInteger(group.min) || !Number.isInteger(group.max) || group.min < 0 || group.max < 1 || group.max > 20 || group.min > group.max || !Array.isArray(group.options) || !group.options.length || group.options.length > 20) throw new PosValidationError('Check the minimum / maximum selections and options in each group.')
    const optionIds = new Set()
    const options = group.options.map((option) => {
      if (typeof option?.id !== 'string' || !keyPattern.test(option.id) || optionIds.has(option.id)) throw new PosValidationError('Options need unique IDs within a group.')
      optionIds.add(option.id)
      if (typeof option.isAvailable !== 'boolean') throw new PosValidationError('Option availability must be true or false.')
      return { id: option.id, label: text(option.label, 80, 'Option name', true), price: amount(option.price), isAvailable: option.isAvailable }
    })
    if (group.min > options.filter((option) => option.isAvailable).length) throw new PosValidationError('Required groups must have enough available options.')
    return { id: group.id, name: text(group.name, 80, 'Group name', true), min: group.min, max: group.max, options }
  })
}
export function resolveOptions(groups = [], selections = []) {
  if (!Array.isArray(selections) || selections.length > 10) throw new PosValidationError('Invalid options. Choose the dish options again.')
  const selected = new Map()
  for (const selection of selections) {
    if (!groups.some((group) => group.id === selection?.groupId) || selected.has(selection.groupId) || !Array.isArray(selection.optionIds) || selection.optionIds.length > 20 || new Set(selection.optionIds).size !== selection.optionIds.length) throw new PosValidationError('Invalid or duplicate options. Choose the dish options again.')
    selected.set(selection.groupId, selection.optionIds)
  }
  let extraCents = 0
  const optionSnapshot = [], normalized = []
  for (const group of groups) {
    const ids = selected.get(group.id) ?? []
    if (ids.length < group.min || ids.length > group.max) throw new PosValidationError(`${group.name}: choose ${group.min === group.max ? group.min : `${group.min}–${group.max}`} option(s).`)
    const options = ids.map((id) => {
      const option = group.options.find((entry) => entry.id === id)
      if (!option || !option.isAvailable) throw new PosValidationError(`${group.name}: an option is no longer available. Choose again.`)
      extraCents += Math.round(amount(option.price) * 100)
      return { id: option.id, label: option.label, price: Number(option.price) }
    })
    if (ids.length) { normalized.push({ groupId: group.id, optionIds: [...ids].sort() }); optionSnapshot.push({ groupName: group.name, options }) }
  }
  return { selections: normalized.sort((a, b) => a.groupId.localeCompare(b.groupId)), optionSnapshot, extraPrice: extraCents / 100 }
}
export function optionText(snapshot = []) {
  return snapshot.map((group) => `${group.groupName}: ${group.options.map((option) => `${option.label}${Number(option.price) > 0 ? ` (+RM ${Number(option.price).toFixed(2)})` : ''}`).join(', ')}`).join(' · ')
}
export function orderAmounts(subtotal, rates = {}) {
  const cents = Math.round(amount(roundMoney(subtotal)) * 100)
  const serviceChargeRate = amount(rates.serviceChargeRate ?? 10, 100), sstRate = amount(rates.sstRate ?? 6, 100)
  const service = Math.round(cents * serviceChargeRate / 100), tax = Math.round(cents * sstRate / 100)
  if (cents + service + tax > 99999999) throw new PosValidationError('The order total exceeds the allowed amount.')
  return { subtotal: cents / 100, serviceCharge: service / 100, sst: tax / 100, grandTotal: (cents + service + tax) / 100, serviceChargeRate, sstRate }
}
export function allocateBill(orders, discountAmount = 0) {
  const entries = orders.map((order) => ({ ...order, ...orderAmounts(Number(order.subtotal), order) }))
  const subtotalCents = entries.reduce((sum, order) => sum + Math.round(order.subtotal * 100), 0)
  let discountCents = Math.round(amount(discountAmount) * 100)
  if (discountCents > subtotalCents) throw new PosValidationError('Discount exceeds the bill subtotal.')
  const originalDiscount = discountCents
  let remainingSubtotal = subtotalCents
  const finalOrders = entries.map((order, index) => {
    const cents = Math.round(order.subtotal * 100)
    const allocated = index === entries.length - 1 ? discountCents : Math.floor(discountCents * cents / (remainingSubtotal || 1))
    discountCents -= allocated
    remainingSubtotal -= cents
    return { ...order, discountAmount: allocated / 100, ...orderAmounts((cents - allocated) / 100, order), subtotal: cents / 100 }
  })
  // Round charges once per rate bucket, not once per ticket. This keeps old
  // single-rate table bills unchanged and supports rate changes during a visit.
  const buckets = new Map()
  finalOrders.forEach((order) => { const key = `${order.serviceChargeRate}/${order.sstRate}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(order) })
  for (const group of buckets.values()) {
    const net = group.reduce((sum, order) => sum + Math.round((order.subtotal - order.discountAmount) * 100), 0)
    const amounts = orderAmounts(net / 100, group[0])
    for (const field of ['serviceCharge', 'sst']) {
      let remaining = Math.round(amounts[field] * 100)
      let remainingNet = net
      group.forEach((order, index) => {
        const cents = Math.round((order.subtotal - order.discountAmount) * 100)
        const share = index === group.length - 1 ? remaining : Math.floor(remaining * cents / (remainingNet || 1))
        remaining -= share; remainingNet -= cents; order[field] = share / 100
      })
    }
    group.forEach((order) => { order.grandTotal = roundMoney(order.subtotal - order.discountAmount + order.serviceCharge + order.sst) })
  }
  return { finalOrders, subtotal: subtotalCents / 100, discountAmount: originalDiscount / 100, serviceCharge: roundMoney(finalOrders.reduce((sum, order) => sum + order.serviceCharge, 0)), sst: roundMoney(finalOrders.reduce((sum, order) => sum + order.sst, 0)), grandTotal: roundMoney(finalOrders.reduce((sum, order) => sum + order.grandTotal, 0)) }
}
