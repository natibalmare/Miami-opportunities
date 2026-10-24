import { useEffect, useState } from 'react'
import { api } from '../utils/api'

const PLAN_CARDS = [
  { id: 'investor', name: 'Investor', month: 29,  year: 290,  reports: 15,  seats: 1 },
  { id: 'pro',      name: 'Pro',      month: 99,  year: 990,  reports: 50,  seats: 2, badge: 'Most Popular' },
  { id: 'business', name: 'Business', month: 249, year: 2490, reports: 150, seats: 5 },
]

const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })

export default function PaymentModal({ folio, address, returnQ, onClose, onSuccess }) {
  const [status, setStatus] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [billing, setBilling] = useState('month')

  useEffect(() => {
    let cancelled = false
    api.getBillingStatus()
      .then(s => { if (!cancelled) setStatus(s) })
      .catch(() => { if (!cancelled) setStatus({ plan: 'free', usage: null }) })
      .finally(() => { if (!cancelled) setLoadingStatus(false) })
    return () => { cancelled = true }
  }, [])

  const goTo = (data) => {
    if (data?.alreadyOwned) { onSuccess?.(); return }
    if (data?.url) { window.location.href = data.url; return }
    throw new Error('Could not open secure checkout. Please try again.')
  }

  const run = async (key, fn) => {
    setBusy(key); setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const useIncluded = () => run('unlock', async () => {
    try {
      await api.unlockReport(folio)
      onSuccess?.()
    } catch (e) {
      if (e.data?.needsOverage) {
        setStatus(s => ({ ...s, usage: { ...(s?.usage || {}), remaining: 0 } }))
        throw new Error('You have used all reports included this period. You can buy an extra report below.')
      }
      throw e
    }
  })

  const buyOverage = () => run('overage', async () => goTo(await api.checkoutOverage(folio, returnQ)))
  const buySingle  = () => run('single', async () => goTo(await api.checkoutReport(folio, returnQ)))
  const subscribe  = (plan) => run(plan, async () => goTo(await api.checkoutMembership(plan, billing)))

  const isMember = status && status.plan && status.plan !== 'free'
  const remaining = status?.usage?.remaining ?? 0

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(42,42,42,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }
  const modal = { background: '#FAFAF8', width: '100%', maxWidth: 500, maxHeight: '92vh', overflowY: 'auto', borderRadius: 10 }
  const header = { background: '#2A2A2A', padding: '20px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderRadius: '10px 10px 0 0' }
  const box = { border: '1px solid #DDD8CC', borderRadius: 8, padding: '14px 16px', marginBottom: 12, background: '#FFFFFF' }
  const toggleBtn = (on) => ({ flex: 1, border: `1px solid ${on ? '#C8A84B' : '#DDD8CC'}`, background: on ? '#F2E8CC' : '#FAFAF8', padding: '7px 0', fontSize: 11.5, cursor: 'pointer', borderRadius: 5 })

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 300, color: '#fff' }}>Unlock Full Report</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 3 }}>{address}</div>
          </div>
          <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 19, cursor: 'pointer' }} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={{ padding: '22px 26px' }}>
          {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

          {loadingStatus ? (
            <div style={{ textAlign: 'center', padding: '30px 0', fontSize: 12.5, color: '#9A9488' }}>Checking your plan…</div>
          ) : isMember ? (
            <>
              <div style={box}>
                <div className="form-label" style={{ marginBottom: 4 }}>{status.planName} plan</div>
                {status.usage ? (
                  <div style={{ fontSize: 12.5, color: '#6B6456', marginBottom: 12 }}>
                    {remaining} of {status.usage.included} reports left this period
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: '#6B6456', marginBottom: 12 }}>
                    Your billing period is renewing. Try again in a few minutes.
                  </div>
                )}
                {remaining > 0 ? (
                  <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', borderRadius: 4 }} onClick={useIncluded} disabled={!!busy}>
                    {busy === 'unlock' ? 'Unlocking…' : 'Use 1 included report →'}
                  </button>
                ) : status.usage && (
                  <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', borderRadius: 4 }} onClick={buyOverage} disabled={!!busy}>
                    {busy === 'overage' ? 'Opening checkout…' : `Buy an extra report · ${money(status.overagePrice)} →`}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={box}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>This report only</div>
                    <div style={{ fontSize: 11, color: '#9A9488' }}>One full report + PDF · one-time</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 300, color: '#A88C38' }}>$15</div>
                </div>
                <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', borderRadius: 4 }} onClick={buySingle} disabled={!!busy}>
                  {busy === 'single' ? 'Opening checkout…' : 'Buy this report →'}
                </button>
              </div>

              <div className="form-label" style={{ margin: '18px 0 8px' }}>Or become a member</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <button style={toggleBtn(billing === 'month')} onClick={() => setBilling('month')}>Monthly</button>
                <button style={toggleBtn(billing === 'year')} onClick={() => setBilling('year')}>Annual · 2 months free</button>
              </div>

              {PLAN_CARDS.map(pl => (
                <div key={pl.id} style={{ ...box, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                      {pl.name}
                      {pl.badge && <span style={{ marginLeft: 6, fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', background: '#C8A84B', color: '#2A2A2A', padding: '1px 6px', borderRadius: 2 }}>{pl.badge}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#9A9488' }}>{pl.reports} full reports/month · {pl.seats} {pl.seats === 1 ? 'user' : 'users'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 300, color: '#A88C38' }}>
                      {billing === 'month' ? `${money(pl.month)}/mo` : `${money(pl.year)}/yr`}
                    </div>
                    <button className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => subscribe(pl.id)} disabled={!!busy}>
                      {busy === pl.id ? 'Opening…' : 'Choose →'}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          <div style={{ fontSize: 10.5, color: '#9A9488', lineHeight: 1.6, marginTop: 8, textAlign: 'center' }}>
            Secure checkout by Stripe · Card details are never stored on Miami Opportunities servers.
            <br />Reports summarize public records — not a title search, title commitment or appraisal.
          </div>
        </div>
      </div>
    </div>
  )
}
