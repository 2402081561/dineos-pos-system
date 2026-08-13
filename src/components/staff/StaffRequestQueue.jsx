import { useEffect, useRef, useState } from 'react'
import StatePanel from '../common/StatePanel'
import ServiceRequestCard from './ServiceRequestCard'
import ServiceRequestSkeleton from './ServiceRequestSkeleton'
import { completeSupabaseServiceRequest } from '../../services/adminApiService'

function StaffRequestQueue({ compact = false, error, isLoading, onRefresh, requests }) {
  const [updatingRequestIds, setUpdatingRequestIds] = useState(new Set())
  const [updateError, setUpdateError] = useState('')
  const updatingRequestIdsRef = useRef(new Set())
  const isMountedRef = useRef(true)
  const visibleRequests = compact ? requests.slice(0, 6) : requests

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  async function handleCompleteRequest(requestId) {
    if (updatingRequestIdsRef.current.has(requestId)) return

    try {
      updatingRequestIdsRef.current.add(requestId)
      setUpdatingRequestIds(new Set(updatingRequestIdsRef.current))
      setUpdateError('')
      await completeSupabaseServiceRequest(requestId)
    } catch (apiError) {
      if (apiError.message?.includes('already completed') || apiError.message?.includes('unavailable')) {
        setUpdateError('This request was already completed. The queue has been refreshed.')
        await onRefresh?.()
        window.setTimeout(() => { if (isMountedRef.current) setUpdateError('') }, 2500)
      } else {
        console.error('[Staff] Failed to complete service request:', apiError)
        setUpdateError('We could not complete this request. Please try again.')
      }
    } finally {
      updatingRequestIdsRef.current.delete(requestId)
      if (isMountedRef.current) setUpdatingRequestIds(new Set(updatingRequestIdsRef.current))
    }
  }

  if (isLoading) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: compact ? 3 : 6 }, (_, index) => <ServiceRequestSkeleton key={index} />)}</div>
  if (error) return <StatePanel description={error} title="Service requests unavailable" tone="error" />
  return <>{updateError && <StatePanel description={updateError} title="Request update failed" tone="error" />}{visibleRequests.length === 0 ? <StatePanel description="New customer requests will appear here automatically." title="No active service requests." /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleRequests.map((request) => <ServiceRequestCard isUpdating={updatingRequestIds.has(request.id)} key={request.id} onComplete={handleCompleteRequest} request={request} />)}</div>}</>
}

export default StaffRequestQueue
