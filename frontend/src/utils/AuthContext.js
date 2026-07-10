import { createContext, useContext, useState, useEffect } from 'react'
import { api } from './api'

export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('mo_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      api.me().then(u => setUser(u)).catch(() => {
        setToken(null); localStorage.removeItem('mo_token')
      }).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  const login = (userData, userToken) => {
    setUser(userData); setToken(userToken)
    localStorage.setItem('mo_token', userToken)
  }

  const logout = () => {
    setUser(null); setToken(null)
    localStorage.removeItem('mo_token')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
