import { useState, useEffect, useMemo } from 'react'
import { api } from '../utils/api'

const money = (n) => (n === null || n === undefined || !Number.isFinite(n)) ? '—' : (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString()
const pct = (n) => (n === null || n === undefined || !Number.isFinite(n)) ? '—' : `${n.toFixed(2)}%`
const num = (v) => { const n = Number(String(v ?? '').replace(/[,$%\s]/g, '')); return Number.isFinite(n) ? n : 0 }

function payment(principal, annualRate, years) {
  const n = years * 12
  const r = annualRate / 100 / 12
  if (principal <= 0 || n <= 0) return 0
  if (r === 0) return principal / n
  return principal * r / (1 - Math.pow(1 + r, -n))
}

const S = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  input: { fontSize: 13, padding: '8px 10px' },
  stat: { background: '#F4F0E8', border: '1px solid #DDD8CC', borderRadius: 6, padding: '10px 12px' },
  statLabel: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#9A9488', marginBottom: 3 },
  statValue: { fontSize: 18, fontWeight: 400, color: '#1A2828', letterSpacing: -0.3 },
  note: { fontSize: 10.5, color: '#9AA4A3', lineHeight: 1.5, marginTop: 8 },
}

function Field({ label, value, onChange, suffix, hint }) {
  return (
    <label style={S.field}>
      <span className="form-label" style={{ marginBottom: 0 }}>{label}{suffix ? ` (${suffix})` : ''}</span>
      <input className="input" style={S.input} inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} />
      {hint && <span style={{ fontSize: 10, color: '#9AA4A3' }}>{hint}</span>}
    </label>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={S.stat}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ ...S.statValue, color: color || S.statValue.color }}>{value}</div>
    </div>
  )
}

export default function InvestmentCalculator({ property }) {
  const startPrice = Math.round(Number(property?.valuation?.asIsEstimate || property?.tax?.assessedValue || 0)) || ''
  const startBeds = Math.min(4, Math.max(0, Number(property?.beds) || 3))

  const [rates, setRates] = useState(null)
  const [rents, setRents] = useState(null)
  const [f, setF] = useState({
    price: String(startPrice), down: '20', rate: '', term: '30', closing: '3',
    beds: String(startBeds), rent: '', taxPct: '2.0', insurance: '', hoa: '0',
    vacancy: '5', mgmt: '8', maint: '5', repairs: '0',
  })
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    api.getRates().then(r => {
      setRates(r)
      setF(p => p.rate ? p : { ...p, rate: String(p.term === '15' ? r.rate15 : r.rate30) })
    }).catch(() => setF(p => p.rate ? p : { ...p, rate: '7.0' }))
  }, [])

  useEffect(() => {
    const zip = String(property?.zip || '').slice(0, 5)
    if (zip.length !== 5) return
    api.getRents(zip).then(r => setRents(r)).catch(() => setRents(null))
  }, [property?.zip])

  /* Fill rent from HUD benchmark when it arrives or bedrooms change (unless the user typed their own) */
  const [rentTouched, setRentTouched] = useState(false)
  useEffect(() => {
    if (rentTouched || !rents?.rents) return
    const b = Math.min(4, Math.max(0, Math.round(num(f.beds))))
    if (rents.rents[b]) setF(p => ({ ...p, rent: String(rents.rents[b]) }))
  }, [rents, f.beds, rentTouched])

  /* Default insurance ≈ 1% of price per year (Florida); user can change */
  useEffect(() => {
    if (f.insurance === '' && num(f.price) > 0) setF(p => ({ ...p, insurance: String(Math.round(num(p.price) * 0.01)) }))
  }, [f.price, f.insurance])

  const setTerm = (v) => {
    setF(p => ({ ...p, term: v, rate: rates ? String(v === '15' ? rates.rate15 : rates.rate30) : p.rate }))
  }

  const r = useMemo(() => {
    const price = num(f.price)
    const downAmt = price * num(f.down) / 100
    const loan = Math.max(0, price - downAmt)
    const pi = payment(loan, num(f.rate), num(f.term))
    const rent = num(f.rent)
    const taxes = price * num(f.taxPct) / 100 / 12
    const ins = num(f.insurance) / 12
    const hoa = num(f.hoa)
    const vacancy = rent * num(f.vacancy) / 100
    const mgmt = rent * num(f.mgmt) / 100
    const maint = rent * num(f.maint) / 100
    const opEx = taxes + ins + hoa + vacancy + mgmt + maint
    const noiMonthly = rent - opEx
    const cashFlow = noiMonthly - pi
    const cashIn = downAmt + price * num(f.closing) / 100 + num(f.repairs)
    return {
      price, downAmt, loan, pi, rent, taxes, ins, hoa, vacancy, mgmt, maint, opEx,
      piti: pi + taxes + ins + hoa,
      noiAnnual: noiMonthly * 12,
      cashFlow,
      capRate: price > 0 ? (noiMonthly * 12) / price * 100 : null,
      coc: cashIn > 0 ? (cashFlow * 12) / cashIn * 100 : null,
      grm: rent > 0 ? price / (rent * 12) : null,
      onePct: price > 0 ? rent / price * 100 : null,
      cashIn,
    }
  }, [f])

  return (
    <div>
      <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Mortgage Calculator</div><div className="gold-rule-line rev" /></div>
      <div style={S.grid}>
        <Field label="Offer / purchase price" suffix="$" value={f.price} onChange={set('price')} hint={startPrice ? `Assessed value ${money(startPrice)}` : null} />
        <Field label="Down payment" suffix="%" value={f.down} onChange={set('down')} hint={money(r.downAmt)} />
        <Field label="Interest rate" suffix="%" value={f.rate} onChange={set('rate')} hint={rates ? `This week's avg: ${rates.rate30}% (30-yr) · ${rates.rate15}% (15-yr)` : 'Loading this week’s rate…'} />
        <label style={S.field}>
          <span className="form-label" style={{ marginBottom: 0 }}>Loan term</span>
          <select className="input" style={S.input} value={f.term} onChange={e => setTerm(e.target.value)}>
            <option value="30">30 years</option>
            <option value="15">15 years</option>
          </select>
        </label>
      </div>
      <div style={{ ...S.grid, marginTop: 12 }}>
        <Stat label="Loan amount" value={money(r.loan)} />
        <Stat label="Principal & interest / mo" value={money(r.pi)} />
        <Stat label="With taxes, insurance, HOA / mo" value={money(r.piti)} />
      </div>
      {rates && <div style={S.note}>Rate: {rates.source}, week of {rates.asOf}. Your actual rate depends on credit, loan type and lender — confirm with a licensed lender.</div>}

      <div className="gold-rule" style={{ marginTop: 22 }}><div className="gold-rule-line" /><div className="gold-rule-text">Rental Income &amp; Return</div><div className="gold-rule-line rev" /></div>
      <div style={S.grid}>
        <label style={S.field}>
          <span className="form-label" style={{ marginBottom: 0 }}>Bedrooms</span>
          <select className="input" style={S.input} value={String(Math.min(4, Math.max(0, Math.round(num(f.beds)))))} onChange={e => set('beds')(e.target.value)}>
            {[0, 1, 2, 3, 4].map(b => <option key={b} value={b}>{b === 0 ? 'Studio' : b === 4 ? '4+' : b}</option>)}
          </select>
        </label>
        <Field label="Monthly rent" suffix="$" value={f.rent} onChange={(v) => { setRentTouched(true); set('rent')(v) }}
          hint={rents?.rents ? `Area rent benchmark (${rents.zip}): ${money(rents.rents[Math.min(4, Math.max(0, Math.round(num(f.beds))))])}` : 'Enter expected rent'} />
        <Field label="Property tax" suffix="% of price / yr" value={f.taxPct} onChange={set('taxPct')} hint="New owners lose the seller's homestead cap — ~2% is a common estimate" />
        <Field label="Insurance" suffix="$ / yr" value={f.insurance} onChange={set('insurance')} hint="Get a real quote — Florida rates vary widely" />
        <Field label="HOA" suffix="$ / mo" value={f.hoa} onChange={set('hoa')} />
        <Field label="Vacancy" suffix="% of rent" value={f.vacancy} onChange={set('vacancy')} />
        <Field label="Management" suffix="% of rent" value={f.mgmt} onChange={set('mgmt')} />
        <Field label="Maintenance" suffix="% of rent" value={f.maint} onChange={set('maint')} />
        <Field label="Closing costs" suffix="% of price" value={f.closing} onChange={set('closing')} />
        <Field label="Repairs at purchase" suffix="$" value={f.repairs} onChange={set('repairs')} />
      </div>

      <div style={{ ...S.grid, marginTop: 12 }}>
        <Stat label="Monthly cash flow" value={money(r.cashFlow)} color={r.cashFlow >= 0 ? '#2E6E4A' : '#B84040'} />
        <Stat label="Cap rate" value={pct(r.capRate)} />
        <Stat label="Cash-on-cash return" value={pct(r.coc)} color={r.coc >= 0 ? '#2E6E4A' : '#B84040'} />
        <Stat label="Net operating income / yr" value={money(r.noiAnnual)} />
        <Stat label="Cash needed to close" value={money(r.cashIn)} />
        <Stat label="Rent-to-price (1% rule)" value={pct(r.onePct)} />
        <Stat label="Gross rent multiplier" value={r.grm ? r.grm.toFixed(1) : '—'} />
      </div>

      <table className="data-table" style={{ marginTop: 12 }}>
        <thead><tr><th>Monthly breakdown</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>
          {[
            ['Rent', r.rent],
            ['Property tax', -r.taxes], ['Insurance', -r.ins], ['HOA', -r.hoa],
            ['Vacancy', -r.vacancy], ['Management', -r.mgmt], ['Maintenance', -r.maint],
            ['Mortgage (principal & interest)', -r.pi],
          ].map(([l, v]) => (
            <tr key={l}><td>{l}</td><td style={{ textAlign: 'right', color: v < 0 ? '#9A4A4A' : '#1A2828' }}>{money(v)}</td></tr>
          ))}
          <tr><td style={{ fontWeight: 600 }}>Cash flow</td><td style={{ textAlign: 'right', fontWeight: 600, color: r.cashFlow >= 0 ? '#2E6E4A' : '#B84040' }}>{money(r.cashFlow)}</td></tr>
        </tbody>
      </table>

      <div style={S.note}>
        Rent benchmark is the government Fair Market Rent for this ZIP and bedroom count — not a rental comparable analysis — actual rents depend on condition, finishes and exact location.
        Results are estimates for analysis only, not financial, tax or lending advice.
      </div>
    </div>
  )
}
