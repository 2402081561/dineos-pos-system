export async function linkMemberEmail(client, { memberId, authUserId, expectedEmail }) {
  if (!/^MEM-\d{5,}$/.test(memberId ?? '') || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authUserId ?? '')) throw new Error('Provide a valid Member ID and Supabase Auth user UUID.')
  const email = String(expectedEmail ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Provide the email whose ownership was verified.')
  const { rows: auth } = await client.query('SELECT id, email, email_confirmed_at, is_anonymous FROM auth.users WHERE id = $1 FOR SHARE', [authUserId])
  if (!auth[0]?.email_confirmed_at || auth[0].is_anonymous || String(auth[0].email).toLowerCase() !== email) throw new Error('The Auth user must have confirmed this exact email first.')
  const { rows } = await client.query(`SELECT id, auth_user_id, email FROM members WHERE concat('MEM-', lpad(member_number::text, 5, '0')) = $1 FOR UPDATE`, [memberId])
  if (!rows[0]) throw new Error('Member not found.')
  if (rows[0].auth_user_id && rows[0].auth_user_id !== authUserId) throw new Error('This member already belongs to another verified account.')
  await client.query('UPDATE members SET auth_user_id = $1, email = $2, email_verified_at = now(), updated_at = now() WHERE id = $3', [authUserId, email, rows[0].id])
  await client.query("INSERT INTO audit_logs (action, target_type, target_id, details) VALUES ('LINK_MEMBER_EMAIL', 'member', $1, $2::jsonb)", [rows[0].id, JSON.stringify({ memberId, authUserId, previousEmail: rows[0].email, email, method: 'administrator-verified-owner' })])
  return { memberId, email }
}
