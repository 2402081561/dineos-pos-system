import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import PointsHistory from '../../components/member/PointsHistory'
import { subscribeToSupabaseMembers } from '../../services/adminApiService'

function formatPoints(value) {
  return `${Math.floor(Number(value) || 0)} points`
}



function Members() {
  const { t: uiText, formatDate: uiDate } = useCustomerLanguage()

  const [members, setMembers] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedMember, setSelectedMember] = useState(null)

  useEffect(() => {
    if (!selectedMember) return () => {}
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedMember(null)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedMember])
  useEffect(
    () =>
      subscribeToSupabaseMembers(
        (nextMembers) => {
          setMembers(nextMembers)
          setError('')
          setIsLoading(false)
        },
        (apiError) => {
          console.error('[Members] Failed to load members:', apiError)
          setError('We could not load members right now. Please try again shortly.')
          setIsLoading(false)
        },
      ),
    [],
  )
  const filteredMembers = useMemo(
    () =>
      members.filter((member) => {
        const matchesSearch = `${member.memberId ?? ''} ${member.name ?? ''} ${member.phone ?? ''}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
        return (
          matchesSearch &&
          (status === 'all' || String(member.status ?? 'active').toLowerCase() === status)
        )
      }),
    [members, search, status],
  )
  if (isLoading)
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-24 rounded-3xl bg-slate-200" />
        <div className="h-80 rounded-3xl bg-white" />
      </div>
    )
  if (error) return <StatePanel description={uiText(error)} title={uiText("Members unavailable")} tone="error" />
  return (
    <div className="space-y-6">
      <SectionHeading
        description={uiText("Customer memberships and their current profile preferences.")}
        eyebrow={uiText("Administration")}
        title={uiText("Members")}
      />
      <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_180px]">
          <input
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={uiText("Search member ID, name or phone")}
            value={search}
          />
          <select
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            onChange={(event) => setStatus(event.target.value)}
            value={uiText(status)}
          >
            <option value="all">{uiText("All statuses")}</option>
            <option value="active">{uiText("Active")}</option>
            <option value="inactive">{uiText("Inactive")}</option>
          </select>
        </div>
        {filteredMembers.length === 0 ? (
          <div className="p-8">
            <StatePanel
              description={uiText("New customer memberships will appear here.")}
              title={uiText("No members found")}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">{uiText("Member")}</th>
                  <th className="px-5 py-3">{uiText("Phone")}</th>
                  <th className="px-5 py-3">{uiText("Email")}</th>
                  <th className="px-5 py-3">{uiText("Points")}</th>
                  <th className="px-5 py-3">{uiText("Status")}</th>
                  <th className="px-5 py-3">{uiText("Created")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr className="border-t" key={member.id}>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">{member.name || '—'}</p>
                      <p className="mt-1 text-xs text-slate-500">{member.memberId || '—'}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{member.phone || '—'}</td>
                    <td className="px-5 py-4 text-slate-600">{member.email || '—'}</td>
                    <td className="px-5 py-4 font-semibold">
                      {uiText(formatPoints(member.pointsBalance))}
                    </td>
                    <td className="px-5 py-4 capitalize">{uiText(member.status || 'active')}</td>
                    <td className="px-5 py-4 text-slate-600">{uiDate(member.createdAt)}</td>
                    <td className="px-5 py-4">
                      <Button
                        className="px-3 py-2"
                        onClick={() => setSelectedMember(member)}
                        variant="outline"
                      >{uiText("Profile")}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selectedMember &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px] sm:p-6"
            onMouseDown={() => setSelectedMember(null)}
          >
            <section
              aria-labelledby="member-profile-title"
              aria-modal="true"
              className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6 sm:py-5">
                <div className="min-w-0">
                  <p className="eyebrow">{uiText("Member profile")}</p>
                  <h2 className="mt-1 truncate text-xl font-bold" id="member-profile-title">
                    {selectedMember.name || '—'}
                  </h2>
                </div>
                <Button onClick={() => setSelectedMember(null)} variant="outline">{uiText("Close")}</Button>
              </div>
              <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                <dl className="grid gap-4 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">{uiText("Member ID")}</dt>
                    <dd className="mt-1 font-bold">{selectedMember.memberId || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{uiText("Status")}</dt>
                    <dd className="mt-1 font-bold capitalize">
                      {uiText(selectedMember.status || 'active')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{uiText("Phone")}</dt>
                    <dd className="mt-1 font-bold">{selectedMember.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{uiText("Points")}</dt>
                    <dd className="mt-1 font-bold">{uiText(formatPoints(selectedMember.pointsBalance))}</dd>
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-slate-500">{uiText("Email")}</dt>
                    <dd className="mt-1 break-words font-bold">{selectedMember.email || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{uiText("Email notifications")}</dt>
                    <dd className="mt-1 font-bold">
                      {selectedMember.emailNotificationsEnabled === true ? uiText("Enabled") : uiText("Disabled")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{uiText("Created")}</dt>
                    <dd className="mt-1 font-bold">{uiDate(selectedMember.createdAt)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500">{uiText("Updated")}</dt>
                    <dd className="mt-1 font-bold">{uiDate(selectedMember.updatedAt)}</dd>
                  </div>
                </dl>
                <div className="mt-6">
                  <PointsHistory memberId={selectedMember.memberId} showFilters />
                </div>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  )
}

export default Members
