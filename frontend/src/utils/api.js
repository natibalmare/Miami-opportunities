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
    const err = await res.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(err.message || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  /* Auth */
  register: (d) => req('/api/auth/register', { method: 'POST', body: d }),
  login:    (email, password) => req('/api/auth/login', { method: 'POST', body: { email, password } }),
  me:       () => req('/api/auth/me'),

  /* Search — the core engine */
  search: (q, type = 'address') =>
    req(`/api/search?q=${encodeURIComponent(q)}&type=${type}`),

  /* Property report — full or free tier */
  getReport: (folio) => req(`/api/property/${folio}`),
  getReportFree: (folio) => req(`/api/property/${folio}/free`),

  /* Foreclosure */
  getForeclosure: (folio) => req(`/api/foreclosure/${folio}`),

  /* Permits */
  getPermits: (folio) => req(`/api/permits/${folio}`),

  /* Tax */
  getTax: (folio) => req(`/api/tax/${folio}`),

  /* Liens */
  getLiens: (folio) => req(`/api/liens/${folio}`),

  /* LLC / SunBiz */
  lookupLLC: (name) => req(`/api/llc?name=${encodeURIComponent(name)}`),

  /* Payments */
  checkoutReport:  (folio) => req('/api/payments/checkout', { method: 'POST', body: { type: 'report', folio } }),
  checkoutMonthly: () => req('/api/payments/subscribe', { method: 'POST', body: { plan: 'monthly' } }),
  checkoutAnnual:  () => req('/api/payments/subscribe', { method: 'POST', body: { plan: 'annual' } }),

  /* Leads CRM */
  getLeads:    () => req('/api/leads'),
  saveLead:    (d) => req('/api/leads', { method: 'POST', body: d }),
  updateLead:  (id, d) => req(`/api/leads/${id}`, { method: 'PATCH', body: d }),
  deleteLead:  (id) => req(`/api/leads/${id}`, { method: 'DELETE' }),
  addNote:     (id, text) => req(`/api/leads/${id}/notes`, { method: 'POST', body: { text } }),
  logContact:  (id, d) => req(`/api/leads/${id}/contact`, { method: 'POST', body: d }),

  /* Buyer/Seller board */
  getBoard:    () => req('/api/board'),
  postListing: (d) => req('/api/board', { method: 'POST', body: d }),

  /* Data sources status */
  getSources: () => req('/api/sources'),
  testSource: (id) => req(`/api/sources/${id}/test`, { method: 'POST' })
}
