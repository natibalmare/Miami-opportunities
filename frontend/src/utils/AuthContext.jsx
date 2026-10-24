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
        setUser(null); setToken(null); localStorage.removeItem('mo_token')
      }).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  /* Another device signed in to this account — this device is signed out */
  useEffect(() => {
    let shown = false
    const onReplaced = (e) => {
      setUser(null); setToken(null)
      localStorage.removeItem('mo_token')
      if (!shown) {
        shown = true
        window.alert(e.detail || 'Your account was signed in on another device. Please sign in again.')
        setTimeout(() => { shown = false }, 3000)
      }
    }
    window.addEventListener('mo:session-replaced', onReplaced)
    return () => window.removeEventListener('mo:session-replaced', onReplaced)
  }, [])

  const login = (userData, userToken) => {
    setUser(userData); setToken(userToken)
    localStorage.setItem('mo_token', userToken)
  }

  const refreshUser = () => api.me().then(u => setUser(u)).catch(() => {})

  const logout = () => {
    if (localStorage.getItem('mo_token')) api.logout().catch(() => {})
    setUser(null); setToken(null)
    localStorage.removeItem('mo_token')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}
