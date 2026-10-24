import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './utils/AuthContext'
import Layout from './components/Layout'
import SearchPage from './pages/SearchPage'
import ReportPage from './pages/ReportPage'
import CriteriaSearch from './pages/CriteriaSearch'
import AboutPage from './pages/AboutPage'
import CalculatorsPage from './pages/CalculatorsPage'
import LeadsDashboard from './pages/LeadsDashboard'
const MapView = lazy(() => import('./pages/MapView'))
import ContactBoard from './pages/ContactBoard'
import AccountPage from './pages/AccountPage'
import DataSources from './pages/DataSources'
import PricingPage from './pages/PricingPage'
import MyListings from './pages/MyListings'
import Messages from './pages/Messages'
import AdminInsights from './pages/AdminInsights'
import AdminCampaigns from './pages/AdminCampaigns'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<AboutPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/criteria" element={<CriteriaSearch />} />
          <Route path="/about" element={<Navigate to="/" replace />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/leads" element={<LeadsDashboard />} />
          <Route path="/map" element={<Suspense fallback={<div style={{ padding: 30, color: '#9A9488' }}>Loading map…</div>}><MapView /></Suspense>} />
          <Route path="/board" element={<ContactBoard />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/sources" element={<DataSources />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/calculators" element={<CalculatorsPage />} />
          <Route path="/my-listings" element={<MyListings />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/admin" element={<AdminInsights />} />
          <Route path="/admin/campaigns" element={<AdminCampaigns />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
