import { useEffect, useState } from 'react'
import PointsHistory from '../../components/member/PointsHistory'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import useCustomerSession from '../../hooks/useCustomerSession'
import { getPublicMember } from '../../services/customerApi'

function MemberProfile() {
  const { session } = useCustomerSession()
  const [member, setMember] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!session?.sessionId || !session?.memberId) { setIsLoading(false); return () => { active = false } }
    const load = async () => {
      try { const next = await getPublicMember(session.sessionId); if (active) { setMember(next); setError('') } }
      catch (profileError) { if (active) { console.error('[Member Profile] Failed to load:', profileError); setError('We could not load your membership right now.') } }
      finally { if (active) setIsLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [session?.memberId, session?.sessionId])

  if (!session?.memberId) return <div className="mx-auto max-w-3xl"><StatePanel description="Scan your table QR and choose Member Login or Create Membership." title="No membership linked" /></div>
  if (isLoading) return <div className="mx-auto max-w-3xl space-y-5 animate-pulse"><div className="h-20 rounded-3xl bg-slate-200" /><div className="h-52 rounded-3xl bg-white" /></div>
  if (error || !member) return <div className="mx-auto max-w-3xl"><StatePanel description={error || 'This membership is unavailable.'} title="Member profile unavailable" tone="error" /></div>

  return <div className="mx-auto max-w-3xl space-y-6"><SectionHeading description="Your membership, points balance and recent activity." eyebrow={`Table ${session.tableNumber}`} title="Member Profile" /><section className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-wide text-orange-300">{member.memberId}</p><h2 className="mt-2 text-3xl font-extrabold">{member.name}</h2><p className="mt-2 text-sm text-slate-300">{member.phone}</p>{member.email && <p className="mt-1 text-sm text-slate-300">{member.email}</p>}</div><div className="rounded-2xl bg-white/10 px-5 py-4 text-right"><p className="text-xs font-bold uppercase tracking-wide text-slate-300">Points</p><p className="mt-1 text-3xl font-extrabold text-orange-300">{Math.max(0, Math.floor(Number(member.pointsBalance) || 0))}</p></div></div><p className="mt-6 text-xs text-slate-400">Status: <span className="font-bold capitalize text-emerald-300">{member.status}</span> · Email notifications: {member.emailNotificationsEnabled ? 'On' : 'Off'}</p></section><PointsHistory memberId={member.id} sessionId={session.sessionId} /></div>
}

export default MemberProfile
