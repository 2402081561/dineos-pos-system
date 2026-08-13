import { useEffect, useState } from 'react'
import Button from '../common/Button'
import { findSupabaseCashierMember } from '../../services/adminApiService'
import PointsHistory from '../member/PointsHistory'

function formatPoints(value) {
  return `${Math.max(0, Math.floor(Number(value) || 0))} points`
}

function MemberLookup({ associatedMemberId = '', onMemberChange }) {
  const [search, setSearch] = useState('')
  const [member, setMember] = useState(null)
  const [error, setError] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  useEffect(() => {
    if (!associatedMemberId) return
    let isCurrent = true
    setIsSearching(true); setError(''); setMember(null)
    findSupabaseCashierMember(associatedMemberId).then((result) => {
      if (!isCurrent) return
      if (result) { setMember(result); onMemberChange?.(result) }
      else { setError('The member associated with this payment could not be found. No points will be awarded.'); onMemberChange?.(null) }
    }).catch((apiError) => {
      console.error('[Cashier Member Lookup] Failed to load associated member:', apiError)
      if (isCurrent) setError('We could not verify the member associated with this payment.')
    }).finally(() => { if (isCurrent) setIsSearching(false) })
    return () => { isCurrent = false }
  }, [associatedMemberId, onMemberChange])
  async function handleSearch(event) {
    event.preventDefault()
    try {
      setIsSearching(true); setError(''); setMember(null)
      const result = await findSupabaseCashierMember(search)
      if (!result) { setError('No member was found for this phone number or member ID.'); onMemberChange?.(null) }
      else { setMember(result); onMemberChange?.(result) }
    } catch (apiError) {
      console.error('[Cashier Member Lookup] Failed to find member:', apiError)
      setError('We could not look up this member right now. Please try again.')
    } finally { setIsSearching(false) }
  }
  return <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><p className="eyebrow">Membership</p><h2 className="mt-1 font-bold text-slate-900">{associatedMemberId ? 'Associated member' : 'Member lookup'}</h2>{associatedMemberId && <p className="mt-1 text-xs text-slate-500">Points can only be awarded to the member recorded on every order in this payment.</p>}<form className="mt-4 flex gap-2" onSubmit={handleSearch}><input className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder="Phone or MEM-00001" value={search} /><Button disabled={!search.trim()} isLoading={isSearching} type="submit" variant="outline">Search</Button></form>{error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}{member && <><div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm"><p className="font-bold text-slate-900">{member.name || '—'}</p><p className="mt-1 text-slate-500">{member.memberId || '—'} · {member.status || 'active'}</p><p className="mt-3 flex justify-between"><span>Points balance</span><span className="font-bold">{formatPoints(member.pointsBalance)}</span></p></div><div className="mt-4"><PointsHistory memberId={member.memberId} showFilters /></div></>}</section>
}

export default MemberLookup
