import { useState } from 'react'
import { api } from '../utils/api'

export default function PaymentModal({ folio, address, onClose, onSuccess }) {
  const [method, setMethod] = useState('card')
  const [plan, setPlan] = useState('report')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const prices = {
    report:  { label: 'Single Report',      amount: 5.99,  fee: method === 'ach' ? 0.05 : 0.47 },
    monthly: { label: 'Unlimited Monthly',  amount: 29.00, fee: method === 'ach' ? 0.23 : 0.97 },
    annual:  { label: 'Annual Membership',  amount: 299.00, fee: method === 'ach' ? 2.40 : 8.97 }
  }
  const p = prices[plan]
  const total = (p.amount + p.fee).toFixed(2)

  const handlePay = async () => {
    setLoading(true); setError('')
    try {
      let data
      if (plan === 'report') data = await api.checkoutReport(folio)
      else if (plan === 'monthly') data = await api.checkoutMonthly()
      else data = await api.checkoutAnnual()
      // In production: window.location.href = data.url
      // Demo: simulate success
      setDone(true); onSuccess?.()
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(42,42,42,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }
  const modal = { background: '#FAFAF8', width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto', borderRadius: 10 }
  const mh = { background: '#2A2A2A', padding: '20px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderRadius: '10px 10px 0 0' }
  const pm = (on) => ({ flex: 1, border: `1px solid ${on ? '#C8A84B' : '#DDD8CC'}`, padding: 9, textAlign: 'center', cursor: 'pointer', fontSize: 11.5, background: on ? '#F2E8CC' : '#FAFAF8', borderRadius: 5 })
  const pc = (on) => ({ border: `${on ? 2 : 1}px solid ${on ? '#C8A84B' : '#DDD8CC'}`, borderRadius: 6, padding: '14px 16px', cursor: 'pointer', background: on ? '#F2E8CC' : '#FAFAF8', position: 'relative', textAlign: 'center' })

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={mh}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 300, color: '#fff' }}>Unlock Full Report</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 3 }}>{address}</div>
          </div>
          <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 19, cursor: 'pointer' }} onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '22px 26px' }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔓</div>
              <div style={{ fontSize: 18, fontWeight: 300, marginBottom: 6 }}>Access Granted</div>
              <div style={{ fontSize: 12, color: '#9A9488', lineHeight: 1.7 }}>Your full intelligence report is now unlocked. A receipt has been sent to your email via Stripe.</div>
              <button className="btn btn-gold" style={{ marginTop: 20, borderRadius: 4 }} onClick={onClose}>View Full Report →</button>
            </div>
          ) : (
            <>
              {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

              {/* PLAN SELECTOR */}
              <div className="form-label" style={{ marginBottom: 8 }}>Choose Access</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div style={pc(plan === 'report')} onClick={() => setPlan('report')}>
                  <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#9A9488', marginBottom: 5 }}>Per Report</div>
                  <div style={{ fontSize: 22, fontWeight: 300, color: '#2A2A2A', letterSpacing: -0.8 }}>$5.99</div>
                  <div style={{ fontSize: 9.5, color: '#9A9488', marginTop: 3 }}>one report + PDF</div>
                </div>
                <div style={{ ...pc(plan === 'monthly'), position: 'relative' }} onClick={() => setPlan('monthly')}>
                  {plan === 'monthly' && <div style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', background: '#C8A84B', color: '#2A2A2A', fontSize: 8, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '1px 8px', borderRadius: 2, whiteSpace: 'nowrap' }}>Best Value</div>}
                  <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#9A9488', marginBottom: 5 }}>Monthly</div>
                  <div style={{ fontSize: 22, fontWeight: 300, color: '#2A2A2A', letterSpacing: -0.8 }}>$29</div>
                  <div style={{ fontSize: 9.5, color: '#9A9488', marginTop: 3 }}>unlimited · auto-renews</div>
                </div>
                <div style={pc(plan === 'annual')} onClick={() => setPlan('annual')}>
                  <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#9A9488', marginBottom: 5 }}>Annual</div>
                  <div style={{ fontSize: 22, fontWeight: 300, color: '#2A2A2A', letterSpacing: -0.8 }}>$299</div>
                  <div style={{ fontSize: 9.5, color: '#9A9488', marginTop: 3 }}>save $49/yr</div>
                </div>
              </div>

              {/* PAYMENT METHOD */}
              <div className="form-label" style={{ marginBottom: 8 }}>Payment Method</div>
              <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
                <div style={pm(method === 'card')} onClick={() => setMethod('card')}>
                  <div style={{ fontSize: 17, marginBottom: 3 }}>💳</div>Credit / Debit
                </div>
                <div style={pm(method === 'ach')} onClick={() => setMethod('ach')}>
                  <div style={{ fontSize: 17, marginBottom: 3 }}>🏦</div>Bank (ACH)
                </div>
              </div>

              {method === 'card' && (
                <>
                  <div className="form-group"><label className="form-label">Card Number</label><input className="input" placeholder="1234 5678 9012 3456" /></div>
                  <div className="grid-2">
                    <div className="form-group"><label className="form-label">Expiry</label><input className="input" placeholder="MM / YY" /></div>
                    <div className="form-group"><label className="form-label">CVV</label><input className="input" placeholder="•••" /></div>
                  </div>
                  <div className="form-group"><label className="form-label">Name on Card</label><input className="input" placeholder="Natalia Rodriguez" /></div>
                </>
              )}
              {method === 'ach' && (
                <>
                  <div className="form-group"><label className="form-label">Routing Number</label><input className="input" placeholder="021000021" /></div>
                  <div className="form-group"><label className="form-label">Account Number</label><input className="input" placeholder="Checking account number" /></div>
                  <div className="form-group"><label className="form-label">Account Holder</label><input className="input" placeholder="Natalia Rodriguez" /></div>
                </>
              )}

              <div className="alert alert-gold" style={{ marginBottom: 12 }}>
                <span>Secured by Stripe · {method === 'card' ? '2.9% + 30¢ card fee' : '0.8% ACH fee (capped at $5)'} added below · No card data stored on our servers
                </span>
              </div>

              <div style={{ border: '1px solid #DDD8CC', borderRadius: 6, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: '#6B6456' }}>{p.label}</span><span>${p.amount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                  <span style={{ color: '#6B6456' }}>Processing fee</span><span>${p.fee.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #DDD8CC', paddingTop: 8 }}>
                  <span style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: 'uppercase', color: '#6B6456' }}>Total Charged</span>
                  <span style={{ fontSize: 18, fontWeight: 300, letterSpacing: -0.5 }}>${total}</span>
                </div>
              </div>

              <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', borderRadius: 4 }} onClick={handlePay} disabled={loading}>
                {loading ? 'Processing…' : `Pay $${total} & Unlock →`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
