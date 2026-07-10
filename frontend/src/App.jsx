import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './utils/AuthContext'
import Layout from './components/Layout'
import SearchPage from './pages/SearchPage'
import ReportPage from './pages/ReportPage'
import LeadsDashboard from './pages/LeadsDashboard'
import MapView from './pages/MapView'
import ContactBoard from './pages/ContactBoard'
import AccountPage from './pages/AccountPage'
import DataSources from './pages/DataSources'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<SearchPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/leads" element={<LeadsDashboard />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/board" element={<ContactBoard />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/sources" element={<DataSources />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
