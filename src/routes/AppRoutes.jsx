import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AdminLayout from '../layouts/AdminLayout'
import CashierLayout from '../layouts/CashierLayout'
import ProtectedAdminRoute from '../components/admin/ProtectedAdminRoute'
import ProtectedCashierRoute from '../components/cashier/ProtectedCashierRoute'
import ProtectedRoleRoute from '../components/auth/ProtectedRoleRoute'
import CustomerLayout from '../layouts/CustomerLayout'
import CustomerSessionRoute from '../components/customer/CustomerSessionRoute'
import KitchenLayout from '../layouts/KitchenLayout'
import StaffLayout from '../layouts/StaffLayout'
const Login = lazy(() => import('../pages/admin/Login'))
const CategoryManagement = lazy(() => import('../pages/admin/CategoryManagement'))
const AdminDashboard = lazy(() => import('../pages/admin/Dashboard'))
const MenuManagement = lazy(() => import('../pages/admin/MenuManagement'))
const OrderManagement = lazy(() => import('../pages/admin/OrderManagement'))
const Reports = lazy(() => import('../pages/admin/Reports'))
const TableManagement = lazy(() => import('../pages/admin/TableManagement'))
const AuditLog = lazy(() => import('../pages/admin/AuditLog'))
const Members = lazy(() => import('../pages/admin/Members'))
const Rewards = lazy(() => import('../pages/admin/Rewards'))
const ShopSettings = lazy(() => import('../pages/admin/ShopSettings'))
const Bill = lazy(() => import('../pages/customer/Bill'))
const Cart = lazy(() => import('../pages/customer/Cart'))
const FoodDetails = lazy(() => import('../pages/customer/FoodDetails'))
const JoinSession = lazy(() => import('../pages/customer/JoinSession'))
const TakeawayJoin = lazy(() => import('../pages/customer/TakeawayJoin'))
const Landing = lazy(() => import('../pages/customer/Landing'))
const Menu = lazy(() => import('../pages/customer/Menu'))
const More = lazy(() => import('../pages/customer/More'))
const OrderHistory = lazy(() => import('../pages/customer/OrderHistory'))
const ServiceRequests = lazy(() => import('../pages/customer/ServiceRequests'))
const Tracking = lazy(() => import('../pages/customer/Tracking'))
const TableSummary = lazy(() => import('../pages/customer/TableSummary'))
const CustomerRewards = lazy(() => import('../pages/customer/Rewards'))
const MemberProfile = lazy(() => import('../pages/customer/MemberProfile'))
const KitchenDashboard = lazy(() => import('../pages/kitchen/Dashboard'))
const StaffDashboard = lazy(() => import('../pages/staff/Dashboard'))
const Requests = lazy(() => import('../pages/staff/Requests'))
const Tables = lazy(() => import('../pages/staff/Tables'))
const CashierDashboard = lazy(() => import('../pages/cashier/Dashboard'))
const CashierNewOrder = lazy(() => import('../pages/cashier/NewOrder'))
const Notifications = lazy(() => import('../pages/cashier/Notifications'))
const Receipt = lazy(() => import('../pages/cashier/Receipt'))
const ReceiptHistory = lazy(() => import('../pages/cashier/ReceiptHistory'))
const ShiftClosing = lazy(() => import('../pages/cashier/Closing'))
const ClosingDetails = lazy(() => import('../pages/cashier/ClosingDetails'))
const Refunds = lazy(() => import('../pages/admin/Refunds'))
const RefundRecord = lazy(() => import('../pages/admin/RefundRecord'))

function AppRoutes() {
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={<Landing />} />
        <Route path="join" element={<JoinSession />} />
        <Route path="takeaway" element={<TakeawayJoin />} />
        <Route element={<CustomerSessionRoute />}>
          <Route path="tracking" element={<Tracking />} />
          <Route path="menu" element={<Menu />} />
          <Route path="more" element={<More />} />
          <Route path="menu/:itemId" element={<FoodDetails />} />
          <Route path="cart" element={<Cart />} />
          <Route path="service-requests" element={<ServiceRequests />} />
          <Route path="orders" element={<OrderHistory />} />
          <Route path="rewards" element={<CustomerRewards />} />
          <Route path="member" element={<MemberProfile />} />
          <Route path="table-summary" element={<TableSummary />} />
          <Route path="bill" element={<Bill />} />
        </Route>
      </Route>

      <Route path="staff" element={<ProtectedRoleRoute roles={['admin', 'staff']}><StaffLayout /></ProtectedRoleRoute>}>
        <Route index element={<StaffDashboard />} />
        <Route path="requests" element={<Requests />} />
        <Route path="tables" element={<Tables />} />
      </Route>

      <Route path="kitchen" element={<ProtectedRoleRoute roles={['admin', 'kitchen']}><KitchenLayout /></ProtectedRoleRoute>}>
        <Route index element={<KitchenDashboard />} />
      </Route>

      <Route path="admin/login" element={<Login />} />
      <Route path="cashier" element={<ProtectedCashierRoute><CashierLayout /></ProtectedCashierRoute>}>
        <Route index element={<CashierDashboard />} />
        <Route path="new-order" element={<CashierNewOrder />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="history" element={<ReceiptHistory />} />
        <Route path="receipt/:receiptNumber" element={<Receipt />} />
        <Route path="closing" element={<ShiftClosing />} />
        <Route path="closing/:closingId" element={<ClosingDetails />} />
      </Route>
      <Route path="admin" element={<ProtectedAdminRoute><AdminLayout /></ProtectedAdminRoute>}>
        <Route index element={<Navigate replace to="dashboard" />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="kitchen" element={<KitchenDashboard />} />
        <Route path="menu" element={<MenuManagement />} />
        <Route path="categories" element={<CategoryManagement />} />
        <Route path="tables" element={<TableManagement />} />
        <Route path="orders" element={<OrderManagement />} />
        <Route path="reports" element={<Reports />} />
        <Route path="refunds" element={<Refunds />} />
        <Route path="refunds/:refundNumber" element={<RefundRecord />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="members" element={<Members />} />
        <Route path="rewards" element={<Rewards />} />
        <Route path="settings" element={<ShopSettings />} />
      </Route>

      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}

export default AppRoutes
