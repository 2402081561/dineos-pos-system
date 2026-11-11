// These independent SELECTs already ran outside a transaction. Limit parallel
// reads rather than bursting all seven onto the shared DB pool at once. Return
// a complete snapshot only: never present half a bill after a failed read.
export async function readCashierSnapshot(queries) {
  const results = new Array(queries.length)
  let cursor = 0
  let failure
  await Promise.all(Array.from({ length: Math.min(3, queries.length) }, async () => {
    while (!failure && cursor < queries.length) {
      const index = cursor++
      try { results[index] = await queries[index]() }
      catch (error) { failure ??= error }
    }
  }))
  if (failure) throw failure
  return results
}
