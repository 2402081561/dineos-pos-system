// Advisory workload model, not a promise or an automatic status transition.
// All tables, counter orders, dine-in and take-away share the same capacity.
export const defaultKitchenConfig = { kitchenCapacity: 3, preparationMinMinutes: 3, preparationMaxMinutes: 4 }

export function kitchenConfig(config = {}) {
  const merged = { ...defaultKitchenConfig, ...config }
  return {
    kitchenCapacity: Number(merged.kitchenCapacity),
    preparationMinMinutes: Number(merged.preparationMinMinutes),
    preparationMaxMinutes: Number(merged.preparationMaxMinutes),
  }
}

function schedule(lanes, quantity, minutes) {
  let finish = 0
  for (let portion = 0; portion < quantity; portion++) {
    let lane = 0
    for (let index = 1; index < lanes.length; index++) if (lanes[index] < lanes[lane]) lane = index
    lanes[lane] += minutes
    finish = Math.max(finish, lanes[lane])
  }
  return finish
}

export function kitchenEstimates(queue, config = {}, previewQuantity = 1) {
  const { kitchenCapacity, preparationMinMinutes, preparationMaxMinutes } = kitchenConfig(config)
  if (!Number.isInteger(kitchenCapacity) || kitchenCapacity < 1 || kitchenCapacity > 20 || !Number.isInteger(preparationMinMinutes) || preparationMinMinutes < 1 || !Number.isInteger(preparationMaxMinutes) || preparationMaxMinutes < preparationMinMinutes || preparationMaxMinutes > 120) throw new Error('Invalid kitchen estimate configuration.')
  const lower = Array(kitchenCapacity).fill(0), upper = Array(kitchenCapacity).fill(0)
  const byOrder = new Map()
  const range = (quantity) => {
    const minimum = schedule(lower, quantity, preparationMinMinutes)
    const maximum = schedule(upper, quantity, preparationMaxMinutes)
    return { minimum, maximum, label: `${minimum}–${maximum} mins` }
  }
  const active = queue.filter((order) => ['received', 'preparing'].includes(order.status) && Number(order.quantity) > 0)
    .sort((a, b) => Number(b.status === 'preparing') - Number(a.status === 'preparing') || new Date(a.createdAt) - new Date(b.createdAt) || String(a.id).localeCompare(String(b.id)))
  for (const order of active) {
    const quantity = Number(order.quantity)
    if (!Number.isSafeInteger(quantity) || quantity > 100000) throw new Error('Invalid kitchen workload quantity.')
    const estimate = range(quantity)
    // In-progress work still occupies capacity until the kitchen marks it ready.
    // Do not infer ready/served from elapsed time or from payment.
    if (order.status === 'received') byOrder.set(order.id, estimate)
  }
  if (!Number.isInteger(previewQuantity) || previewQuantity < 1 || previewQuantity > 50) throw new Error('Preview quantity must be between 1 and 50.')
  return { byOrder, preview: range(previewQuantity) }
}

export async function loadKitchenEstimates(pool, previewQuantity = 1) {
  // One SQL snapshot for settings and workload; never return another table's data.
  const { rows } = await pool.query(`SELECT config,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status, 'createdAt', q.created_at, 'quantity', q.quantity)) FROM (
      SELECT orders.id, orders.status, orders.created_at, SUM(order_items.quantity - order_items.fulfilled_quantity)::integer AS quantity
      FROM orders JOIN order_items ON order_items.order_id = orders.id
      JOIN table_sessions ON table_sessions.id = orders.table_session_id
      WHERE orders.status IN ('received', 'preparing') AND table_sessions.status = 'active'
      GROUP BY orders.id, orders.status, orders.created_at HAVING SUM(order_items.quantity - order_items.fulfilled_quantity) > 0
    ) q), '[]'::jsonb) AS queue FROM shop_settings WHERE id = 1`)
  if (!rows[0]) throw new Error('Shop settings unavailable.')
  return kitchenEstimates(rows[0].queue, rows[0].config, previewQuantity)
}

export function registerKitchenEstimateRoutes(app, { pool }) {
  app.get('/api/v1/public/preparation-estimate', async (request, response, next) => {
    const raw = request.query.quantity ?? '1'
    if (typeof raw !== 'string' || !/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 50) return response.status(400).json({ error: 'Choose a quantity between 1 and 50.' })
    try {
      const { preview } = await loadKitchenEstimates(pool, Number(raw))
      return response.set('Cache-Control', 'no-store').json({ estimate: preview })
    } catch (error) { return next(error) }
  })
}
