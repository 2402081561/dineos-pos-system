import { Navigate, Route, Routes } from 'react-router-dom'
import AdminLayout from '../layouts/AdminLayout'
import CashierLayout from '../layouts/CashierLayout'
import ProtectedAdminRoute from '../components/admin/ProtectedAdminRoute'
import ProtectedCashierRoute from '../components/cashier/ProtectedCashierRoute'
import CustomerLayout from '../layouts/CustomerLayout'
import CustomerSessionRoute from '../components/customer/CustomerSessionRoute'
import KitchenLayout from '../layouts/KitchenLayout'
import StaffLayout from '../layouts/StaffLayout'
import Login from '../pages/admin/Login'
import CategoryManagement from '../pages/admin/CategoryManagement'
import { default as AdminDashboard } from '../pages/admin/Dashboard'
import MenuManagement from '../pages/admin/MenuManagement'
import OrderManagement from '../pages/admin/OrderManagement'
import Reports from '../pages/admin/Reports'
import TableManagement from '../pages/admin/TableManagement'
import Bill from '../pages/customer/Bill'
import Cart from '../pages/customer/Cart'
import FoodDetails from '../pages/customer/FoodDetails'
import JoinSession from '../pages/customer/JoinSession'
import Landing from '../pages/customer/Landing'
import Menu from '../pages/customer/Menu'
import ServiceRequests from '../pages/customer/ServiceRequests'
import Tracking from '../pages/customer/Tracking'
import TableSummary from '../pages/customer/TableSummary'
import KitchenDashboard from '../pages/kitchen/Dashboard'
import StaffDashboard from '../pages/staff/Dashboard'
import Requests from '../pages/staff/Requests'
import Tables from '../pages/staff/Tables'
import CashierDashboard from '../pages/cashier/Dashboard'
import Receipt from '../pages/cashier/Receipt'
import ReceiptHistory from '../pages/cashier/ReceiptHistory'
import ShiftClosing from '../pages/cashier/Closing'
import ClosingDetails from '../pages/cashier/ClosingDetails'

function AppRoutes() {
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={<Landing />} />
        <Route path="join" element={<JoinSession />} />
        <Route path="tracking" element={<Tracking />} />
        <Route element={<CustomerSessionRoute />}>
          <Route path="menu" element={<Menu />} />
          <Route path="menu/:itemId" element={<FoodDetails />} />
          <Route path="cart" element={<Cart />} />
          <Route path="service-requests" element={<ServiceRequests />} />
          <Route path="table-summary" element={<TableSummary />} />
          <Route path="bill" element={<Bill />} />
        </Route>
      </Route>

      <Route path="staff" element={<StaffLayout />}>
        <Route index element={<StaffDashboard />} />
        <Route path="requests" element={<Requests />} />
        <Route path="tables" element={<Tables />} />
      </Route>

      <Route path="kitchen" element={<KitchenLayout />}>
        <Route index element={<KitchenDashboard />} />
      </Route>

      <Route path="admin/login" element={<Login />} />
      <Route path="cashier" element={<ProtectedCashierRoute><CashierLayout /></ProtectedCashierRoute>}>
        <Route index element={<CashierDashboard />} />
        <Route path="history" element={<ReceiptHistory />} />
        <Route path="receipt/:receiptNumber" element={<Receipt />} />
        <Route path="closing" element={<ShiftClosing />} />
        <Route path="closing/:closingId" element={<ClosingDetails />} />
      </Route>
      <Route path="admin" element={<ProtectedAdminRoute><AdminLayout /></ProtectedAdminRoute>}>
        <Route index element={<Navigate replace to="dashboard" />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="menu" element={<MenuManagement />} />
        <Route path="categories" element={<CategoryManagement />} />
        <Route path="tables" element={<TableManagement />} />
        <Route path="orders" element={<OrderManagement />} />
        <Route path="reports" element={<Reports />} />
      </Route>

      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}

export default AppRoutes
