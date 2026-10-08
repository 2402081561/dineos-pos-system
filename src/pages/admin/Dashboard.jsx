import AdminDashboardSkeleton from '../../components/admin/AdminDashboardSkeleton'
import AdminDashboardOverview from '../../components/admin/AdminDashboardOverview'
import StatePanel from '../../components/common/StatePanel'
import useAdminDashboard from '../../hooks/useAdminDashboard'

function Dashboard() {
  const { dashboardData, isLoading, error } = useAdminDashboard()
  if (isLoading) return <AdminDashboardSkeleton />
  if (error) return <StatePanel description={error} title="Dashboard unavailable" tone="error" />
  return <AdminDashboardOverview data={dashboardData} />
}

export default Dashboard
