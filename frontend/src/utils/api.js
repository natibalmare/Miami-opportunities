const BASE = import.meta.env.VITE_API_URL || ''

async function req(path, opts = {}) {
  const token = localStorage.getItem('mo_token')
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    if (res.status === 401 && err.code === 'SESSION_REPLACED') {
      localStorage.removeItem('mo_token')
      window.dispatchEvent(new CustomEvent('mo:session-replaced', { detail: err.error }))
    }
    const e = new Error(err.error || err.message || `HTTP ${res.status}`)
    e.status = res.status
    e.data = err
    throw e
  }
  return res.json()
}

export const api = {
  register: (d) => req('/api/auth/register', { method: 'POST', body: d }),
  login:    (email, password) => req('/api/auth/login', { method: 'POST', body: { email, password } }),
  me:       () => req('/api/auth/me'),
  verifyEmail: (code) => req('/api/auth/verify-email', { method: 'POST', body: { code } }),
  resendCode:  () => req('/api/auth/resend-code', { method: 'POST' }),
  logout:      () => req('/api/auth/logout', { method: 'POST' }),
  forgotPassword: (email) => req('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword:  (email, code, password) => req('/api/auth/reset-password', { method: 'POST', body: { email, code, password } }),

  search: (q, type = 'address') =>
    req(`/api/search?q=${encodeURIComponent(q)}&type=${type}`),

  getCriteriaMeta: () => req('/api/criteria/meta'),
  criteriaSearch: (params) => req(`/api/criteria?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined))}`),
  suggestAddresses: (q) => req(`/api/search/suggest?q=${encodeURIComponent(q)}`),

  getReport: (folio) => req(`/api/property/${folio}`),
  getReportFree: (folio) => req(`/api/property/${folio}/free`),
  getForeclosure: (folio) => req(`/api/foreclosure/${folio}`),
  getPermits: (folio) => req(`/api/permits/${folio}`),
  getTax: (folio) => req(`/api/tax/${folio}`),
  getLiens: (folio) => req(`/api/liens/${folio}`),
  lookupLLC: (name) => req(`/api/llc?name=${encodeURIComponent(name)}`),

  /* Payments — Single Report $15, Investor / Pro / Business memberships */
  getPlans:           () => req('/api/payments/plans'),
  getBillingStatus:   () => req('/api/payments/status'),
  getAccess:          (folio) => req(`/api/payments/access/${encodeURIComponent(folio)}`),
  checkoutReport:     (folio) => req('/api/payments/checkout', { method: 'POST', body: { folio } }),
  checkoutMembership: (plan, interval = 'month') => req('/api/payments/membership/checkout', { method: 'POST', body: { plan, interval } }),
  unlockReport:       (folio) => req('/api/payments/unlock', { method: 'POST', body: { folio } }),
  checkoutOverage:    (folio) => req('/api/payments/overage/checkout', { method: 'POST', body: { folio } }),
  getBillingPortal:   () => req('/api/payments/portal'),

  getLeads:    () => req('/api/leads'),
  saveLead:    (d) => req('/api/leads', { method: 'POST', body: d }),
  updateLead:  (id, d) => req(`/api/leads/${id}`, { method: 'PATCH', body: d }),
  deleteLead:  (id) => req(`/api/leads/${id}`, { method: 'DELETE' }),
  addNote:     (id, text) => req(`/api/leads/${id}/notes`, { method: 'POST', body: { text } }),
  logContact:  (id, d) => req(`/api/leads/${id}/contact`, { method: 'POST', body: d }),

  getBoard:    () => req('/api/board'),
  postListing: (d) => req('/api/board', { method: 'POST', body: d }),

  getSources: () => req('/api/sources'),
  testSource: (id) => req(`/api/sources/${id}/test`, { method: 'POST' })
}
