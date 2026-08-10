import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'

function useAuth() {
  const authState = useContext(AuthContext)

  if (!authState) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }

  return authState
}

export default useAuth
