const singleLine = value => String(value ?? '').replace(/\s+/g, ' ').trim()

export function createTelegramOrderNotice({ env = process.env, fetchImpl = globalThis.fetch, warn = console.warn } = {}) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = env.TELEGRAM_ORDER_CHAT_ID?.trim()
  const enabled = env.TELEGRAM_ORDER_NOTICES_ENABLED === 'true'
  const configured = /^\d+:[\w-]+$/.test(token ?? '') && /^-?[1-9]\d*$/.test(chatId ?? '')
  if (enabled && !configured) warn('Telegram order notices enabled but configuration is incomplete.')

  return async function notify(order, { tableNumber, isTakeawayQr } = {}, items = []) {
    if (!enabled || !configured) return
    const location = !isTakeawayQr && tableNumber != null ? `Table ${tableNumber}` : 'Takeaway'
    const total = Number(order.grandTotal)
    const header = [
      '🔔 DineOS · New customer order',
      location,
      order.tableOrderNumber != null ? `Order #${order.tableOrderNumber}` : null,
    ].filter(Boolean).join('\n')
    const footer = Number.isFinite(total) ? `\nTotal: RM ${total.toFixed(2)}` : ''
    let text = header
    for (const [index, item] of items.entries()) {
      const options = (item.optionSnapshot ?? []).flatMap(group => group.options.map(option => singleLine(option.label))).filter(Boolean)
      const notes = singleLine(item.notes)
      const line = [
        `\n${item.quantity}× ${singleLine(item.name)}`,
        options.length ? `  Options: ${options.join(', ')}` : null,
        notes ? `  Note: ${notes}` : null,
      ].filter(Boolean).join('\n')
      if (text.length + line.length + footer.length > 3800) {
        text += `\n… ${items.length - index} more line(s) in DineOS`
        break
      }
      text += line
    }
    text += footer
    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_notification: false, allow_paid_broadcast: false }),
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok || !(await response.json()).ok) warn('Telegram order notice was not accepted.')
    } catch {
      // Error details can contain the credential-bearing request URL.
      warn('Telegram order notice could not be sent.')
    }
  }
}
