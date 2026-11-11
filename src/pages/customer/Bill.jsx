import { Navigate } from 'react-router-dom'

// Keep previously saved bill links safe without offering a request action.
// The cashier can still split and collect payment; existing requests stay saved.
export default function Bill() {
  return <Navigate replace to="/table-summary" />
}
