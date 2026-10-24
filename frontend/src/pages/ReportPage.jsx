import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { lookupProperty } from '../utils/mockDb'
import { api } from '../utils/api'

function mapMdpaToProperty(r) {
  if (!r) return null
  const county = r.county || 'Miami-Dade'
  const isMD = county === 'Miami-Dade'
  const links = r.links || {
    appraiser: 'https://www.miamidade.gov/Apps/PA/propertysearch/',
    tax: 'https://miamidade.county-taxes.com',
    clerk: 'https://www.miamidadeclerk.gov',
    foreclosure: 'https://www.miamidade.realforeclose.com',
  }
  const LOCK = '🔒 Members only — unlock to view'
  const owner1 = r.locked ? LOCK : (r.owner1 || 'Unknown')
  const mailing = [r.mailingAddr, r.mailingCity, r.mailingState, r.mailingZip].filter(Boolean).join(', ')
  const matchesProp = typeof r.absentee === 'boolean'
    ? !r.absentee
    : !!(r.mailingAddr && r.address && r.mailingAddr.toUpperCase().includes(r.address.toUpperCase().split(' ').slice(0, 2).join(' ')))
  const occupancy = r.homestead === true ? 'owner-occupied' : r.absentee === true ? 'absentee-owner' : 'unknown'
  return {
    folio: r.folio,
    county,
    address: r.address,
    city: r.city || (isMD ? 'Miami' : county),
    state: 'FL',
    zip: r.zip,
    neighborhood: r.subdivision || 'N/A',
    propertyType: r.propertyType || 'N/A',
    yearBuilt: r.yearBuilt,
    beds: r.beds,
    baths: r.baths,
    livingArea: r.livingArea,
    lotSize: r.lotSize,
    zoning: r.zoning,
    locked: !!r.locked,
    score: r.score ?? null,
    scoreLabel: r.scoreLabel || null,
    scoreFactors: r.scoreFactors || [],
    financeability: r.financeability ?? null,
    owner: {
      name: owner1,
      type: /LLC|INC|CORP|LTD/i.test(owner1) ? 'LLC' : /TRUST|\bTR\b|ESTATE/i.test(owner1) ? 'Trust' : 'Individual',
      mailing: r.locked ? LOCK : (mailing || 'N/A'),
      matchesProp,
      homestead: typeof r.homestead === 'boolean' ? r.homestead : null,
      occupancy,
    },
    tax: {
      assessedValue: r.assessedValue,
      annualTax: null,
      status: 'verify',
      delinquent: null,
      sourceUrl: links.tax,
    },
    mortgage: { freeClear: null },
    deeds: r.lastSaleDate ? [{ date: `${String(r.lastSaleDate).slice(0, 10)}T12:00:00`, type: 'Last recorded sale', grantor: '—', grantee: owner1, amount: r.lastSalePrice, instrNo: null }] : [],
    liens: [],
    foreclosure: { lispendens: false, active: false, urgency: 'low' },
    permits: [],
    codeViolations: [],
    valuation: {
      asIsEstimate: r.assessedValue,
      confidence: 30,
      source: `${county} assessed/just value (not a market estimate)`,
    },
    comps: [],
    nextSteps: [
      `Verify tax status directly with the ${county} tax office`,
      `Search ${county} Clerk Official Records for mortgages and liens`,
      'Check City/County permit history before making an offer',
      `Confirm foreclosure status with the ${county} Clerk`,
    ],
    links,
    strategy: `Ownership, value and building details come from official ${county} public records. Tax status, liens, permits, foreclosure and comparable sales are being added — verify them before making an offer.`,
  }
}
import { useAuth } from '../utils/AuthContext'
import ScoreRing from '../components/ScoreRing'
import AuthModal from '../components/AuthModal'
import PaymentModal from '../components/PaymentModal'
import InvestmentCalculator from '../components/InvestmentCalculator'

const fmt = { currency: n => n ? '$' + n.toLocaleString() : 'N/A', date: d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A' }

const TABS = ['Overview', 'Ownership', 'Taxes & Liens', 'Foreclosure', 'Permits', 'Valuation', 'Investment', 'Next Steps']

function SectionHead({ title, badge, badgeType = 'silver', collapsible, collapsed, onToggle }) {
  return (
    <div
      className="card-header"
      style={{ cursor: collapsible ? 'pointer' : 'default' }}
      onClick={collapsible ? onToggle : undefined}
    >
      <div className="t-label" style={{ color: '#2A2A2A', letterSpacing: 1.5 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {badge && <span className={`badge badge-${badgeType}`}>{badge}</span>}
        {collapsible && <span style={{ fontSize: 12, color: '#9A9488', transform: collapsed ? 'rotate(-90deg)' : '', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>}
      </div>
    </div>
  )
}

function DataRow({ label, value, color }) {
  return (
    <div className="data-row">
      <span className="data-key">{label}</span>
      <span className={`data-val ${color || ''}`}>{value}</span>
    </div>
  )
}

function LockRow({ label, width = 120 }) {
  return (
    <div className="lock-row">
      <span style={{ color: '#9A9488' }}>{label}</span>
      <span><span className="lock-bar" style={{ width }} /><span style={{ fontSize: 11, color: '#DDD8CC', marginLeft: 5 }}>🔒</span></span>
    </div>
  )
}

export default function ReportPage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const [prop, setProp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState('Overview')
  const [unlocked, setUnlocked] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const isSample = params.get('sample') === '1'
  const [authOpen, setAuthOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [collapsed, setCollapsed] = useState({})

  const q = params.get('q') || ''

  useEffect(() => {
    setLoading(true); setNotFound(false); setProp(null); setUnlocked(false); setTab('Overview')
    let cancelled = false

    async function run() {
      /* Sample data only for the 'View Sample Report' button — real searches always use live records */
      const demo = params.get('sample') === '1' ? lookupProperty(q) : null
      if (demo) {
        if (!cancelled) { setProp(demo); setLoading(false) }
        return
      }
      try {
        const cleanQ = q.replace(/[-\s]/g, '')
        const type = /^\d{13}$/.test(cleanQ) ? 'folio'
          : /\bllc\b|\binc\b|\bcorp\b/i.test(q) ? 'company'
          : /^\d+\s+[nwse]/i.test(q) || /\b(st|ave|blvd|rd|dr|ct|ln|ter|pl|way)\b/i.test(q) ? 'address'
          : 'owner'
        const res = await api.search(q, type)
        const first = res?.results?.[0]
        const mapped = mapMdpaToProperty(first)
        if (!cancelled) {
          if (mapped) setProp(mapped)
          else setNotFound(true)
          setLoading(false)
        }
      } catch (e) {
        console.error('Live search failed:', e.message)
        if (!cancelled) { setNotFound(true); setLoading(false) }
      }
    }

    run()
    return () => { cancelled = true }
  }, [q, params.get('sample'), reloadKey])

  /* Is this report already unlocked for the signed-in user?
     After a Stripe payment (?paid=true) keep checking briefly while the payment confirms. */
  const folioForAccess = prop?.folio
  const paidReturn = params.get('paid') === 'true'
  useEffect(() => {
    if (!user || !folioForAccess) return
    let cancelled = false
    let tries = 0
    let timer = null
    const check = async () => {
      try {
        const r = await api.getAccess(folioForAccess)
        if (cancelled) return
        if (r.unlocked) { setUnlocked(true); return }
      } catch (e) { /* keep report visible; access stays locked */ }
      if (paidReturn && !cancelled && ++tries < 10) timer = setTimeout(check, 2000)
    }
    check()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [user, folioForAccess, paidReturn])

  /* Paid details come from the server only after unlocking — reload once access is confirmed */
  useEffect(() => {
    if (unlocked && prop?.locked) setReloadKey(k => k + 1)
  }, [unlocked, prop?.locked])

  const scoreColor = (s) => s >= 76 ? '#B84040' : s >= 51 ? '#A88C38' : s >= 26 ? '#8C6010' : '#9A9488'
  const toggle = (k) => setCollapsed(p => ({ ...p, [k]: !p[k] }))

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 14 }}>
      <div className="loading-bar" style={{ width: 300 }} />
      <div style={{ fontSize: 14, fontWeight: 300, color: '#2A2A2A' }}>Running intelligence check on "{q}"</div>
      <div style={{ fontSize: 11.5, color: '#9A9488' }}>Checking public records…</div>
    </div>
  )

  if (notFound) return (
    <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center', padding: 20 }}>
      <div style={{ fontSize: 36, marginBottom: 14 }}>◎</div>
      <div style={{ fontSize: 20, fontWeight: 300, marginBottom: 8 }}>No Records Found</div>
      <div style={{ fontSize: 14, color: '#A88C38', fontWeight: 500, marginBottom: 12 }}>"{q}"</div>
      <div style={{ fontSize: 12.5, color: '#9A9488', lineHeight: 1.7, marginBottom: 24 }}>
        This address was not found in Miami-Dade, Broward or Palm Beach County records.
      </div>
      <div className="card" style={{ textAlign: 'left', marginBottom: 16 }}>
        <div className="card-body">
          <div className="t-label" style={{ marginBottom: 10 }}>Possible Reasons</div>
          {['Pick the address from the suggestions while typing', 'Check the street number and direction (NE, NW, SE, SW)', 'Try the folio / parcel number for an exact match', 'Use Criteria Search to find it by ZIP, street or owner'].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #EDE8DC', fontSize: 12 }}>
              <span style={{ color: '#C8A84B', flexShrink: 0 }}>◦</span>{t}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
        <button className="btn btn-gold btn-sm" onClick={() => nav('/search')}>← New Search</button>
        <button className="btn btn-outline btn-sm" onClick={() => nav('/report?q=332+NW+35th+St&sample=1')}>View Sample Report</button>
      </div>
      <div className="t-label" style={{ marginBottom: 10 }}>Sample Properties in Dataset</div>
      {['332 NW 35th St, Miami FL 33127', '1425 NE 83rd St, Miami FL 33138', '415 NE 75th St, Miami FL 33138'].map(a => (
        <div key={a} onClick={() => nav(`/report?q=${encodeURIComponent(a)}`)}
          style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#FAFAF8', border: '1px solid #DDD8CC', marginBottom: 5, cursor: 'pointer', borderRadius: 5, fontSize: 12.5 }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#C8A84B'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#DDD8CC'}
        >
          <span>{a}</span><span style={{ fontSize: 9, color: '#9A9488', letterSpacing: 1 }}>DEMO</span>
        </div>
      ))}
    </div>
  )

  if (!prop) return null
  const p = prop

  const isForeclosure = p.foreclosure?.active
  const hasForeclosureIndicators = p.foreclosure?.lispendens || p.foreclosure?.active

  return (
    <div className="fade-in">
      {/* ── EXECUTIVE HERO ────────────────────────────────────────────────── */}
      <div style={{ background: '#2A2A2A', borderRadius: 10, padding: '22px 26px', marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: '50%', border: '1px solid rgba(200,168,75,0.08)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 400, color: '#FAFAF8', letterSpacing: -0.3, marginBottom: 2 }}>
              {p.address}, {p.city}, {p.state} {p.zip}
            </div>
            <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>
              Folio {p.folio} · {p.neighborhood} · {p.propertyType} · {p.beds}/{p.baths} · {p.livingArea?.toLocaleString()} sqft
            </div>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
              {[
                ['As-Is Est.', fmt.currency(p.valuation?.asIsEstimate || p.valuation?.pov)],
                ['ARV Est.',   fmt.currency(p.valuation?.arvEstimate)],
                ['Opp. Score', p.score !== null && p.score !== undefined ? `${p.score} / 100` : '—'],
                ['Financing',  p.financeability === 'cash-only' ? 'Cash Only' : p.financeability === 'maybe-203k' ? '203(k) Likely' : p.financeability === 'maybe' ? 'Maybe Financeable' : 'Unknown'],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 300, color: l === 'Financing' && p.financeability === 'cash-only' ? '#E07070' : 'rgba(200,168,75,0.9)', letterSpacing: -0.3 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-gold btn-sm" onClick={() => unlocked ? window.print() : user ? setPayOpen(true) : setAuthOpen(true)}>
              {unlocked ? '📄 Export PDF' : 'View Full Report'}
            </button>
            <button className="btn btn-ghost btn-sm" style={{ color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.15)' }}>Save Lead</button>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: 0.5 }}>
          Last updated: {new Date().toLocaleDateString()} · Estimates only — not an appraisal · All data from legally accessible public records
        </div>
      </div>

      {/* ── FORECLOSURE BANNER ───────────────────────────────────────────── */}
      {isForeclosure && (
        <div style={{ background: '#F5E8E8', border: '1px solid #D4A0A0', borderLeft: '3px solid #B84040', borderRadius: 6, padding: '12px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#7A2A2A', marginBottom: 2 }}>⚠ Active Foreclosure — Auction {fmt.date(p.foreclosure.auctionDate)}</div>
            <div style={{ fontSize: 11.5, color: '#9A4A4A' }}>Case #{p.foreclosure.caseNo} · Plaintiff: {p.foreclosure.plaintiff}</div>
          </div>
          <a href={p.foreclosure.auctionUrl} target="_blank" rel="noreferrer" className="btn btn-danger btn-sm">View Auction →</a>
        </div>
      )}

      {/* ── SCORES ────────────────────────────────────────────────────────── */}
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="card">
          <div style={{ padding: '14px 18px', display: 'flex', gap: 16, alignItems: 'center' }}>
            <ScoreRing score={p.score} size={80} />
            <div>
              <div className="t-label" style={{ marginBottom: 6 }}>Opportunity Score</div>
              <div style={{ fontSize: 11.5, color: '#6B6456', lineHeight: 1.6 }}>
                {p.scoreLabel && <div style={{ fontWeight: 600, color: '#1A2828', marginBottom: 2 }}>{p.scoreLabel}</div>}
                {(p.scoreFactors || []).slice(0, 5).map((f, i) => (
                  <div key={i}>{f.points > 0 ? '▲' : f.points < 0 ? '▼' : '•'} {f.label}</div>
                ))}
                {p.locked && <div style={{ color: '#A8863E', marginTop: 2 }}>🔒 Unlock the report to see what drives this score</div>}
                {p.scoreFactors && <div style={{ fontSize: 10, color: '#9AA4A3', marginTop: 4 }}>Preliminary — tax, lien and foreclosure indicators will be added. Final opportunity depends on the seller and negotiation.</div>}
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div style={{ padding: '14px 18px' }}>
            <div className="t-label" style={{ marginBottom: 8 }}>Financeability Score</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5, color: p.financeability === 'cash-only' ? '#B84040' : p.financeability === 'maybe-203k' ? '#8C6010' : '#2E6E4A' }}>
                {p.financeability === 'cash-only' ? 'Cash / Hard Money Only' :
                 p.financeability === 'maybe-203k' ? 'FHA 203(k) Likely' :
                 p.financeability === 'maybe' ? 'Maybe Financeable' :
                 p.financeability === 'likely' ? 'Likely Financeable' : 'Unknown'}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#9A9488', marginTop: 6, lineHeight: 1.6 }}>
              {p.financeability === 'cash-only' && 'Vacant land — standard FHA / conventional home loans generally do not apply'}
              {p.financeability === 'maybe-203k' && 'Older property — condition may require a renovation loan such as FHA 203(k)'}
              {p.financeability === 'maybe' && 'Condition verification needed before lender commitment'}
              {p.financeability === 'likely' && 'No major financing obstacles detected in public records'}
            </div>
          </div>
        </div>
      </div>

      {/* ── TABS ──────────────────────────────────────────────────────────── */}
      <div className="tab-bar" style={{ borderRadius: '8px 8px 0 0', border: '1px solid #DDD8CC', borderBottom: 'none' }}>
        {TABS.map(t => (
          <button key={t} className={`tab-item ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="card" style={{ borderRadius: '0 0 10px 10px' }}>
        <div className="card-body">
          {!unlocked && !isSample && tab !== 'Overview' ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
              <div style={{ fontSize: 16, fontWeight: 400, marginBottom: 6 }}>{tab} is part of the full report</div>
              <div style={{ fontSize: 12.5, color: '#9A9488', marginBottom: 16 }}>Unlock this property with a membership report or a single $15 report.</div>
              <button className="btn btn-gold" onClick={() => user ? setPayOpen(true) : setAuthOpen(true)}>Unlock Full Report</button>
            </div>
          ) : (<>

          {/* ── OVERVIEW ────────────────────────────────────────────────── */}
          {tab === 'Overview' && (
            <div>
              <div className="grid-4" style={{ marginBottom: 16 }}>
                {[
                  ['Year Built', p.yearBuilt],
                  ['Bed / Bath', `${p.beds} / ${p.baths}`],
                  ['Living Area', `${p.livingArea?.toLocaleString()} sqft`],
                  ['Lot Size',    `${p.lotSize?.toLocaleString()} sqft`],
                  ['Last Sale',  fmt.currency(p.deeds?.[0]?.amount)],
                  ['Sale Date',  fmt.date(p.deeds?.[0]?.date)],
                  ['Assessed',   fmt.currency(p.tax?.assessedValue)],
                  ['Flood Zone', p.floodZone || 'N/A'],
                ].map(([k, v]) => (
                  <div key={k} className="mini-stat"><div className="mini-stat-label">{k}</div><div className="mini-stat-value">{v}</div></div>
                ))}
              </div>

              <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Owner & Occupancy</div><div className="gold-rule-line rev" /></div>

              <div className="grid-2" style={{ marginBottom: 14 }}>
                <div>
                  <DataRow label="Current Owner" value={p.owner?.name} />
                  <DataRow label="Mailing Address" value={p.owner?.mailing} />
                  <DataRow label="Mail = Property?" value={p.owner?.matchesProp ? 'Yes' : 'No — Different Address'} color={p.owner?.matchesProp ? 'green' : 'red'} />
                  <DataRow label="Homestead Exemption" value={p.locked ? '🔒 Members only' : p.owner?.homestead ? 'Active' : p.owner?.homestead === false ? 'None' : 'Unknown'} color={p.locked ? '' : p.owner?.homestead ? 'green' : 'red'} />
                </div>
                <div>
                  <DataRow label="Occupancy Status" value={p.locked ? '🔒 Members only' : p.owner?.occupancy === 'absentee-owner' ? 'Absentee Owner' : p.owner?.occupancy === 'owner-occupied' ? 'Owner Occupied' : 'Unknown'} color={p.owner?.occupancy === 'absentee-owner' ? 'red' : ''} />
                  <DataRow label="Owner Type" value={p.owner?.type} />
                  <DataRow label="Zoning" value={p.zoning || 'N/A'} />
                  <DataRow label="Property Type" value={p.propertyType} />
                </div>
              </div>

              {/* VACANCY INDICATORS */}
              <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Vacancy Indicators</div><div className="gold-rule-line rev" /></div>
              <div className="alert alert-warning" style={{ marginBottom: 10 }}>
                <div>
                  <strong>Possible Indicators Only</strong> — Do not assume vacancy without field verification.
                  <ul style={{ paddingLeft: 18, marginTop: 6, fontSize: 11.5 }}>
                    {!p.locked && p.owner?.homestead === false && <li>No homestead exemption on file</li>}
                    {!p.owner?.matchesProp && <li>Owner mailing address does not match property</li>}
                    {p.tax?.delinquent && <li>Tax delinquency detected — {p.tax?.priorYearDelinquent ? '2+ years' : 'current year'}</li>}
                    {p.codeViolations?.length > 0 && <li>{p.codeViolations.length} open code violation{p.codeViolations.length > 1 ? 's' : ''} on record</li>}
                    {p.foreclosure?.active && <li>Active foreclosure proceeding</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ── OWNERSHIP ───────────────────────────────────────────────── */}
          {tab === 'Ownership' && (
            <div>
              <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Mortgage & Equity Analysis</div><div className="gold-rule-line rev" /></div>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="card" style={{ border: '1px solid #EDE8DC' }}>
                  <div className="card-body">
                    <DataRow label="Appears Free & Clear" value={p.mortgage?.freeClear ? 'Yes' : 'No — Mortgage on Record'} color={p.mortgage?.freeClear ? 'green' : 'red'} />
                    {!p.mortgage?.freeClear && <>
                      <DataRow label="Lender" value={p.mortgage?.lender} />
                      <DataRow label="Original Amount" value={fmt.currency(p.mortgage?.amount)} />
                      <DataRow label="Recording Date" value={fmt.date(p.mortgage?.date)} />
                      <DataRow label="Est. Balance*" value={fmt.currency(p.mortgage?.estBalance)} color="gold" />
                      {p.mortgage?.assignments && <DataRow label="Assignments" value={p.mortgage.assignments} />}
                    </>}
                  </div>
                </div>
                {!p.mortgage?.freeClear && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ background: '#2A2A2A', borderRadius: 8, padding: '14px 16px' }}>
                      <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>Estimated Owner Equity</div>
                      <div style={{ fontSize: 26, fontWeight: 300, color: 'rgba(200,168,75,0.9)', letterSpacing: -1 }}>
                        {fmt.currency((p.valuation?.asIsEstimate || p.valuation?.pov) - (p.mortgage?.estBalance || 0))}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
                        {fmt.currency(p.valuation?.asIsEstimate || p.valuation?.pov)} est. value − {fmt.currency(p.mortgage?.estBalance)} est. balance
                      </div>
                    </div>
                    <div className="alert alert-gold">*Balance is an estimate. Verify actual payoff with title company or lender.</div>
                  </div>
                )}
              </div>

              <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Deed History</div><div className="gold-rule-line rev" /></div>
              <table className="data-table">
                <thead><tr><th>Date</th><th>Type</th><th>Grantor</th><th>Grantee</th><th>Amount</th><th>Instrument</th></tr></thead>
                <tbody>
                  {(p.deeds || []).map((d, i) => (
                    <tr key={i}>
                      <td>{fmt.date(d.date)}</td>
                      <td>{d.type}</td>
                      <td style={{ fontSize: 11 }}>{d.grantor}</td>
                      <td style={{ fontSize: 11 }}>{d.grantee}</td>
                      <td style={{ fontWeight: 600 }}>{fmt.currency(d.amount)}</td>
                      <td style={{ fontSize: 10, color: '#9A9488' }}>{d.instrNo || (d.book ? `${d.book}/${d.page}` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: 'right', marginTop: 8 }}><span className="pending-tag">Coming soon</span></div>

              {p.owner?.type === 'LLC' && (
                <>
                  <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">LLC Ownership</div><div className="gold-rule-line rev" /></div>
                  <div className="alert alert-info">
                    <div>
                      <strong>LLC-owned property.</strong> Skip trace unavailable directly. To find the human behind this entity:<br />
                      <span style={{ color: '#185FA5', fontWeight: 600 }}>LLC officer &amp; registered agent lookup — coming soon</span><br />
                      <span style={{ fontSize: 11, color: '#1A3050' }}>The registered agent is the legally required public contact for any Florida LLC</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── TAXES & LIENS ────────────────────────────────────────────── */}
          {tab === 'Taxes & Liens' && (
            <div>
              {p.tax?.delinquent && (
                <div className="alert alert-danger" style={{ marginBottom: 14 }}>
                  <div>
                    <strong>Tax Delinquency Detected</strong> — Taxes appear delinquent for {p.tax.priorYearDelinquent ? 'current and prior year' : 'current year'}.
                    {p.tax.taxCert && ' A tax certificate is on file.'}
                  </div>
                </div>
              )}

              <div className="grid-4" style={{ marginBottom: 16 }}>
                <div className="mini-stat"><div className="mini-stat-label">Annual Tax</div><div className="mini-stat-value red">{fmt.currency(p.tax?.annualTax)}</div></div>
                <div className="mini-stat"><div className="mini-stat-label">Tax Status</div><div className={`mini-stat-value ${p.tax?.delinquent ? 'red' : 'green'}`}>{p.tax?.delinquent ? 'Delinquent' : p.tax?.status === 'paid' ? 'Paid' : 'Verify'}</div></div>
                {p.tax?.amountDue && <div className="mini-stat"><div className="mini-stat-label">Est. Due</div><div className="mini-stat-value red">{fmt.currency(p.tax.amountDue)}</div></div>}
                <div className="mini-stat"><div className="mini-stat-label">Tax Cert.</div><div className={`mini-stat-value ${p.tax?.taxCert ? 'red' : 'green'}`}>{p.tax?.taxCert ? 'On File' : 'None'}</div></div>
              </div>

              <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Liens & Judgments</div><div className="gold-rule-line rev" /></div>

              {(p.liens || []).length > 0 ? (
                <>
                  <table className="data-table">
                    <thead><tr><th>Type</th><th>Creditor</th><th>Amount</th><th>Date</th><th>Instrument #</th><th>Status</th></tr></thead>
                    <tbody>
                      {p.liens.map((l, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{l.type}</td>
                          <td>{l.creditor}</td>
                          <td style={{ fontWeight: 600 }}>{fmt.currency(l.amount)}</td>
                          <td>{fmt.date(l.date)}</td>
                          <td style={{ fontSize: 10, color: '#9A9488' }}>{l.instrNo || '—'}</td>
                          <td><span className={`badge badge-${l.status === 'open' ? 'red' : 'green'}`}>{l.status.charAt(0).toUpperCase() + l.status.slice(1)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#B84040' }}>
                      Total Open Liens: {fmt.currency(p.liens.filter(l => l.status === 'open').reduce((a, b) => a + (b.amount || 0), 0))}
                    </div>
                    <span className="pending-tag">Coming soon</span>
                  </div>
                </>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#9A9488', fontSize: 13 }}>
                  No liens in current dataset · Full search requires Clerk Records integration
                </div>
              )}

              {/* FORECLOSURE QUICK STATUS */}
              <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Foreclosure / Lis Pendens</div><div className="gold-rule-line rev" /></div>
              {p.foreclosure?.active ? (
                <div className="alert alert-danger">
                  <div>
                    <strong>Active Foreclosure</strong> — Case #{p.foreclosure.caseNo}<br />
                    Plaintiff: {p.foreclosure.plaintiff} · Filed: {fmt.date(p.foreclosure.filingDate)}<br />
                    Final Judgment: <strong>{fmt.currency(p.foreclosure.finalJudgment)}</strong> · Auction: <strong>{fmt.date(p.foreclosure.auctionDate)}</strong>
                  </div>
                </div>
              ) : (
                <div className="alert alert-success">No active foreclosure case or lis pendens found in current dataset. Monitor for new filings.</div>
              )}
            </div>
          )}

          {/* ── FORECLOSURE ──────────────────────────────────────────────── */}
          {tab === 'Foreclosure' && (
            <div>
              {!p.foreclosure?.active && !p.foreclosure?.lispendens && (
                <div className="alert alert-success" style={{ marginBottom: 14 }}>No foreclosure case or lis pendens found at this time. Continue monitoring.</div>
              )}

              {(p.foreclosure?.active || p.foreclosure?.lispendens) && (
                <div className="card card-accent" style={{ marginBottom: 14, borderColor: '#B84040', borderLeftColor: '#B84040' }}>
                  <div className="card-body">
                    <DataRow label="Lis Pendens Filed" value={p.foreclosure.lispendens ? 'Yes' : 'No'} color={p.foreclosure.lispendens ? 'red' : 'green'} />
                    <DataRow label="Active Foreclosure" value={p.foreclosure.active ? 'Yes' : 'No'} color={p.foreclosure.active ? 'red' : 'green'} />
                    {p.foreclosure.caseNo && <DataRow label="Case Number" value={p.foreclosure.caseNo} />}
                    {p.foreclosure.filingDate && <DataRow label="Filing Date" value={fmt.date(p.foreclosure.filingDate)} />}
                    {p.foreclosure.plaintiff && <DataRow label="Plaintiff / Lender" value={p.foreclosure.plaintiff} />}
                    {p.foreclosure.defendant && <DataRow label="Defendant / Owner" value={p.foreclosure.defendant} />}
                    {p.foreclosure.status && <DataRow label="Case Status" value={p.foreclosure.status} color="red" />}
                    {p.foreclosure.finalJudgment && <DataRow label="Final Judgment" value={fmt.currency(p.foreclosure.finalJudgment)} color="red" />}
                    {p.foreclosure.auctionDate && <DataRow label="Auction Date" value={fmt.date(p.foreclosure.auctionDate)} color="red" />}
                    <DataRow label="Urgency" value={p.foreclosure.urgency?.toUpperCase()} color={p.foreclosure.urgency === 'high' ? 'red' : p.foreclosure.urgency === 'medium' ? 'amber' : ''} />
                  </div>
                </div>
              )}

              {p.foreclosure?.auctionUrl && (
                <div style={{ marginBottom: 14 }}>
                  <div className="t-label" style={{ marginBottom: 8 }}>Official Auction Record</div>
                  <a href={p.foreclosure.auctionUrl} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2A2A2A', color: 'rgba(200,168,75,0.9)', padding: '9px 16px', borderRadius: 5, fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
                    View official auction record →
                  </a>
                  <div style={{ fontSize: 10.5, color: '#9A9488', marginTop: 6 }}>Live auction data, opening bid, bidding registration, and case documents available at the official Miami-Dade Foreclosure Auction portal</div>
                </div>
              )}

            </div>
          )}

          {/* ── PERMITS ──────────────────────────────────────────────────── */}
          {tab === 'Permits' && (
            <div>
              {(p.fhaFlags || []).length > 0 && (
                <div className="alert alert-warning" style={{ marginBottom: 14 }}>
                  <div>
                    <strong>Potential Financing Flags — FHA / Conventional</strong>
                    <ul style={{ paddingLeft: 18, marginTop: 6, fontSize: 11.5 }}>
                      {p.fhaFlags.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {(p.permits || []).length > 0 ? (
                <>
                  <div className="t-label" style={{ marginBottom: 10 }}>Building Permits</div>
                  <table className="data-table">
                    <thead><tr><th>Type</th><th>Permit #</th><th>Description</th><th>Date</th><th>Status</th></tr></thead>
                    <tbody>
                      {p.permits.map((pm, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{pm.type}</td>
                          <td style={{ fontSize: 10, color: '#9A9488' }}>{pm.number}</td>
                          <td>{pm.desc}</td>
                          <td>{fmt.date(pm.date)}</td>
                          <td><span className={`badge badge-${pm.status === 'open' ? 'red' : pm.status === 'expired' ? 'amber' : 'green'}`}>{pm.status.charAt(0).toUpperCase() + pm.status.slice(1)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#9A9488', fontSize: 13 }}>No permits in current dataset</div>
              )}

              {(p.codeViolations || []).length > 0 && (
                <>
                  <div className="gold-rule" style={{ marginTop: 16 }}><div className="gold-rule-line" /><div className="gold-rule-text">Code Violations</div><div className="gold-rule-line rev" /></div>
                  <table className="data-table">
                    <thead><tr><th>Case #</th><th>Type</th><th>Date</th><th>Fine</th><th>Status</th></tr></thead>
                    <tbody>
                      {p.codeViolations.map((v, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 10, color: '#9A9488' }}>{v.case}</td>
                          <td>{v.type}</td>
                          <td>{fmt.date(v.date)}</td>
                          <td>{fmt.currency(v.fine)}</td>
                          <td><span className={`badge badge-${v.status === 'open' ? 'red' : 'green'}`}>{v.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <div style={{ marginTop: 12, textAlign: 'right' }}><span className="pending-tag">Coming soon</span></div>
            </div>
          )}

          {/* ── VALUATION ────────────────────────────────────────────────── */}
          {tab === 'Valuation' && (
            <div>
              <div className="alert alert-gold" style={{ marginBottom: 14 }}>
                All valuations are estimates — <strong>not an appraisal</strong>. Current figure is the county assessed value, not a market estimate.
              </div>

              <div className="grid-3" style={{ marginBottom: 16 }}>
                <div className="mini-stat"><div className="mini-stat-label">Low Estimate</div><div className="mini-stat-value">{fmt.currency(p.valuation?.povLow)}</div></div>
                <div style={{ background: '#2A2A2A', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>As-Is Estimate</div>
                  <div style={{ fontSize: 24, fontWeight: 300, color: 'rgba(200,168,75,0.9)', letterSpacing: -1 }}>{fmt.currency(p.valuation?.asIsEstimate || p.valuation?.pov)}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>${p.valuation?.priceSqft}/sqft</div>
                </div>
                <div className="mini-stat" style={{ background: '#E8F2EC', border: '1px solid #A8D4B8' }}>
                  <div className="mini-stat-label" style={{ color: '#2E6E4A' }}>Est. ARV</div>
                  <div className="mini-stat-value green">{fmt.currency(p.valuation?.arvEstimate)}</div>
                </div>
              </div>

              <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Comparable Sales</div><div className="gold-rule-line rev" /></div>
              {(p.comps || []).map((c, i) => (
                <div key={i} className="comp-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{c.address}</div>
                      <div style={{ fontSize: 11, color: '#9A9488' }}>Sold {fmt.date(c.soldDate)} · {c.sqft?.toLocaleString()} sqft · {c.distance} · {c.type}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{fmt.currency(c.soldPrice)}</div>
                      <div style={{ fontSize: 11, color: '#9A9488' }}>Adj: {fmt.currency(c.adjPrice)}</div>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 8, textAlign: 'right' }}><span className="pending-tag">Comparable sales — coming soon</span></div>
            </div>
          )}

          {/* ── NEXT STEPS ───────────────────────────────────────────────── */}
          {tab === 'Next Steps' && (
            <div>
              <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Buyer Strategy Summary</div><div className="gold-rule-line rev" /></div>
              <div className="strategy-box" style={{ marginBottom: 16 }}>"{p.strategy}"</div>

              <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Recommended Action Items</div><div className="gold-rule-line rev" /></div>
              {(p.nextSteps || []).map((step, i) => (
                <div key={i} className="step-item">
                  <div className="step-num">{i + 1}</div>
                  <div>{step}</div>
                </div>
              ))}

              <div className="gold-rule" style={{ marginTop: 16 }}><div className="gold-rule-line" /><div className="gold-rule-text">Legal & Ethical Notice</div><div className="gold-rule-line rev" /></div>
              <div className="legal-notice">
                Family law records can be sensitive. Use this information ethically and only for lawful real estate research. Do not harass, pressure, or misrepresent anything to the property owner. Do not state that a person "must sell." This report shows potential distress indicators only — the decision to reach out is yours. All owner contact must be respectful and lawful. This report is not a title commitment, legal opinion, or appraisal.
              </div>
            </div>
          )}

          {/* ── INVESTMENT ──────────────────────────────────────────────── */}
          {tab === 'Investment' && <InvestmentCalculator property={p} />}
          </>)}
        </div>
      </div>

      {/* ── PAYWALL ───────────────────────────────────────────────────────── */}
      {!unlocked && !isSample && (
        <div className="paywall" style={{ borderRadius: 10, marginTop: 12 }}>
          <div className="paywall-text">
            <span className="paywall-strong">Unlock the Full Intelligence Report</span>
            Owner contact info · Deed history · All liens · Foreclosure detail · Permits · Comps · ARV · Buyer strategy · PDF export
          </div>
          <div className="paywall-btns">
            <button className="paywall-btn-gold" onClick={() => user ? setPayOpen(true) : setAuthOpen(true)}>
              View Full Report
            </button>
            <button className="paywall-btn-ghost" onClick={() => nav('/account')}>
              Membership Plans
            </button>
          </div>
        </div>
      )}

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} afterLogin={() => setPayOpen(true)} />}
      {payOpen && <PaymentModal folio={p.folio} returnQ={q} address={`${p.address}, ${p.city} ${p.state}`} onClose={() => setPayOpen(false)} onSuccess={() => { setPayOpen(false); setUnlocked(true) }} />}
    </div>
  )
}
