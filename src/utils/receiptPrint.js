// Remote logos must finish loading before the browser captures the receipt.
// A broken/slow logo cannot indefinitely prevent printing the payment details.
export async function waitForReceiptAssets() {
  const images = [...document.querySelectorAll('.receipt-print img')]
  let timeout
  try {
    await Promise.race([
      Promise.all([document.fonts?.ready, ...images.map((image) => image.decode?.().catch(() => {}))]),
      new Promise((resolve) => { timeout = setTimeout(resolve, 4000) }),
    ])
  } finally { clearTimeout(timeout) }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}
