import { useContext } from 'react'
import { AdminAuthContext } from '../context/AdminAuthContext'

function useAdminAuth() {
  const value = useContext(AdminAuthContext)
  if (!value) throw new Error('useAdminAuth must be used within an AdminAuthProvider.')
  return value
}

export default useAdminAuth
