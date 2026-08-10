import SectionHeading from '../../components/common/SectionHeading'
import StaffRequestQueue from '../../components/staff/StaffRequestQueue'
import useServiceRequests from '../../hooks/useServiceRequests'

function Requests() {
  const { error, isLoading, requests } = useServiceRequests()

  return <div className="space-y-7"><SectionHeading description="Respond to customer requests in the order they arrive. Completed requests leave this queue automatically." eyebrow="Front of house" title="Needs attention" /><StaffRequestQueue error={error} isLoading={isLoading} requests={requests} /></div>
}

export default Requests
