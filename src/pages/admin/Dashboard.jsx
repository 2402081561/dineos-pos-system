import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import AdminDashboardSkeleton from '../../components/admin/AdminDashboardSkeleton'
import AdminDashboardOverview from '../../components/admin/AdminDashboardOverview'
import StatePanel from '../../components/common/StatePanel'
import useAdminDashboard from '../../hooks/useAdminDashboard'
import useCashierTables from '../../hooks/useCashierTables'

function Dashboard() {
  const { t: uiText } = useCustomerLanguage()

  const { dashboardData, isLoading, error } = useAdminDashboard()
  const floor = useCashierTables()
  if (isLoading) return <AdminDashboardSkeleton />
  if (error && !dashboardData) return <StatePanel description={uiText(error)} title={uiText("Dashboard unavailable")} tone="error" />
  return <AdminDashboardOverview data={dashboardData} floor={floor} />
}

export default Dashboard
