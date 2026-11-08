export const staffServerUnavailable = 'The restaurant server is not responding yet. Please try again shortly. This is not a password error.'

// Only the read-only identity check gets a cold-start allowance. Never extend
// financial writes, replay credentials, refresh tokens or grant access here.
export async function readStaffIdentity(apiUrl, accessToken, { waitForWakeup = false, request = fetch, timeout = (milliseconds) => AbortSignal.timeout(milliseconds) } = {}) {
  let response, body
  try {
    response = await request(`${apiUrl}/api/v1/me`, {
      method: 'GET', signal: timeout(waitForWakeup ? 75000 : 15000),
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    body = await response.json().catch(() => ({}))
  } catch (cause) {
    const error = new Error(staffServerUnavailable, { cause })
    error.code = 'STAFF_SERVER_UNAVAILABLE'
    throw error
  }
  if (!response.ok) {
    const error = new Error(body.error || ([502, 503, 504].includes(response.status) ? staffServerUnavailable : 'The server could not verify this account.'))
    error.status = response.status
    throw error
  }
  if (!body.user || typeof body.user.id !== 'string' || typeof body.user.role !== 'string') throw new Error('The server could not verify this account.')
  return body.user
}
