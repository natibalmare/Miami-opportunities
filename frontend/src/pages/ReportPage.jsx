import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { lookupProperty } from '../utils/mockDb'
import { api } from '../utils/api'

function mapMdpaToProperty(r) {
  if (!r) return null
  const owner1 = r.owner1 || 'Unknown'
  const mailing = [r.mailingAddr, r.mailingCity, r.mailingState, r.mailingZip].filter(Boolean).join(', ')
  const matchesProp = !!(r.mailingAddr && r.address && r.mailingAddr.toUpperCase().includes(r.address.toUpperCase().split(' ').slice(0, 2).join(' ')))
  return {
    folio: r.folio,
    address: r.address,
    city: r.city || 'Miami',
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
    score: null,
    financeability: null,
    owner: {
      name: owner1,
      type: /LLC|INC|CORP|LTD/i.test(owner1) ? 'LLC' : 'Individual',
      mailing: mailing || 'N/A',
      matchesProp,
      homestead: null,
      occupancy: 'unknown',
    },
    tax: {
      assessedValue: r.assessedValue,
      annualTax: null,
      status: 'verify',
      delinquent: null,
      sourceUrl: 'https://miamidade.county-taxes.com',
    },
    mortgage: { freeClear: null },
    deeds: [],
    liens: [],
    foreclosure: { lispendens: false, active: false, urgency: 'low' },
    permits: [],
    codeViolations: [],
    valuation: {
      asIsEstimate: r.assessedValue,
      confidence: 30,
      source: 'Miami-Dade Property Appraiser assessed value (not a market estimate)',
    },
    comps: [],
    nextSteps: [
      'Verify tax status directly with Miami-Dade Tax Collector',
      'Search Miami-Dade Clerk Official Records for mortgages and liens',
      'Check City/County permit history before making an offer',
      'Confirm foreclosure status at miamidade.realforeclose.com',
    ],
    strategy: 'Live parcel data pulled directly from the Miami-Dade Property Appraiser. Tax, lien, permit, foreclosure, and comp data are still pending integration — verify manually before making an offer.',
    dataSources: [
      { name: 'Miami-Dade PA', status: 'live-link', lastChecked: r.fetchedAt, confidence: 90 },
      { name: 'Tax Collector', status: 'pending-integration', lastChecked: null, confidence: 0 },
      { name: 'Clerk Records', status: 'pending-integration', lastChecked: null, confidence: 0 },
      { name: 'City Permits', status: 'pending-integration', lastChecked: null, confidence: 0 },
      { name: 'MLS / iMapp', status: 'auth-required', lastChecked: null, confidence: 0 },
    ],
  }
}
import { useAuth } from '../utils/AuthContext'
import ScoreRing from '../components/ScoreRing'
import AuthModal from '../components/AuthModal'
import PaymentModal from '../components/PaymentModal'

const fmt = { currency: n => n ? '$' + n.toLocaleString() : 'N/A', date: d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A' }

const TABS = ['Overview', 'Ownership', 'Taxes & Liens', 'Foreclosure', 'Permits', 'Valuation', 'Next Steps', 'Sources']

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
  const [authOpen, setAuthOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [collapsed, setCollapsed] = useState({})

  const q = params.get('q') || ''

  useEffect(() => {
    setLoading(true); setNotFound(false); setProp(null); setUnlocked(false); setTab('Overview')
    let cancelled = false

    async function run() {
      const demo = lookupProperty(q)
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
  }, [q])

  const scoreColor = (s) => s >= 76 ? '#B84040' : s >= 51 ? '#A88C38' : s >= 26 ? '#8C6010' : '#9A9488'
  const toggle = (k) => setCollapsed(p => ({ ...p, [k]: !p[k] }))

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 14 }}>
      <div className="loading-bar" style={{ width: 300 }} />
      <div style={{ fontSize: 14, fontWeight: 300, color: '#2A2A2A' }}>Running intelligence check on "{q}"</div>
      <div style={{ fontSize: 11.5, color: '#9A9488' }}>Querying public record sources</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
        {['Property Appraiser', 'Tax Collector', 'Clerk Records', 'Civil Courts', 'Foreclosure Registry', 'Permits', 'Comps'].map(s => (
          <span key={s} className="pending-tag">{s}</span>
        ))}
      </div>
    </div>
  )

  if (notFound) return (
    <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center', padding: 20 }}>
      <div style={{ fontSize: 36, marginBottom: 14 }}>◎</div>
      <div style={{ fontSize: 20, fontWeight: 300, marginBottom: 8 }}>No Records Found</div>
      <div style={{ fontSize: 14, color: '#A88C38', fontWeight: 500, marginBottom: 12 }}>"{q}"</div>
      <div style={{ fontSize: 12.5, color: '#9A9488', lineHeight: 1.7, marginBottom: 24 }}>
        This address was not found in the current demo dataset. The live platform connects to Miami-Dade County records in real time.
      </div>
      <div className="card" style={{ textAlign: 'left', marginBottom: 16 }}>
        <div className="card-body">
          <div className="t-label" style={{ marginBottom: 10 }}>Possible Reasons</div>
          {['Address not found in Miami-Dade County records', 'Property may be in Broward County — requires separate integration', 'Try the folio number (01-XXXX-XXX-XXXX) for exact match', 'Search by owner name or LLC name instead'].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #EDE8DC', fontSize: 12 }}>
              <span style={{ color: '#C8A84B', flexShrink: 0 }}>◦</span>{t}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
        <button className="btn btn-gold btn-sm" onClick={() => nav('/')}>← New Search</button>
        <button className="btn btn-outline btn-sm" onClick={() => nav('/report?q=332+NW+35th+St')}>Try Sample Address</button>
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
                ['Opp. Score', `${p.score} / 100`],
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
            <button className="btn btn-gold btn-sm" onClick={() => user ? setPayOpen(true) : setAuthOpen(true)}>
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
                {p.foreclosure?.active && '• Active foreclosure\n'}
                {p.owner?.homestead === false && '• No homestead exemption '}
                {p.owner?.occupancy === 'absentee-owner' && '• Absentee owned '}
                {p.tax?.delinquent && '• Tax delinquency '}
                {p.mortgage?.freeClear && '• Appears free & clear'}
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
              {p.financeability === 'cash-only' && 'Active foreclosure + LLC title + final judgment blocks all agency financing at auction'}
              {p.financeability === 'maybe-203k' && 'Open permits and code liens must be resolved. 203(k) may cover renovation costs'}
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
                  <DataRow label="Homestead Exemption" value={p.owner?.homestead ? 'Active' : 'None'} color={p.owner?.homestead ? 'green' : 'red'} />
                </div>
                <div>
                  <DataRow label="Occupancy Status" value={p.owner?.occupancy === 'absentee-owner' ? 'Absentee Owner' : p.owner?.occupancy === 'owner-occupied' ? 'Owner Occupied' : 'Unknown'} color={p.owner?.occupancy === 'absentee-owner' ? 'red' : ''} />
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
                    {!p.owner?.homestead && <li>No homestead exemption on file</li>}
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
              <div style={{ textAlign: 'right', marginTop: 8 }}><span className="pending-tag">⏳ Pending — Miami-Dade Clerk Official Records</span></div>

              {p.owner?.type === 'LLC' && (
                <>
                  <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">LLC Ownership</div><div className="gold-rule-line rev" /></div>
                  <div className="alert alert-info">
                    <div>
                      <strong>LLC-owned property.</strong> Skip trace unavailable directly. To find the human behind this entity:<br />
                      <a href="https://search.sunbiz.org" target="_blank" rel="noreferrer" style={{ color: '#185FA5', fontWeight: 600 }}>→ Search Florida SunBiz: {p.owner.name}</a><br />
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
                    <div style={{ marginTop: 4 }}><a href={p.tax.sourceUrl} target="_blank" rel="noreferrer" style={{ color: '#7A2A2A', fontSize: 11 }}>Verify at Miami-Dade Tax Collector →</a></div>
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
                    <span className="pending-tag">⏳ Pending — Miami-Dade Clerk Records</span>
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
                    View miamidade.realforeclose.com →
                  </a>
                  <div style={{ fontSize: 10.5, color: '#9A9488', marginTop: 6 }}>Live auction data, opening bid, bidding registration, and case documents available at the official Miami-Dade Foreclosure Auction portal</div>
                </div>
              )}

              <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Additional Resources</div><div className="gold-rule-line rev" /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['Miami-Dade Foreclosure Registry', 'https://bldgappl.miamidade.gov/foreclosureregistry/default.aspx', 'Verify lis pendens book/page, registration status'],
                  ['Miami-Dade Lis Pendens Search', 'https://onlineservices.miamidadeclerk.gov/officialrecords', 'Search recorded lis pendens in Clerk Official Records'],
                  ['Civil Court Case Search', 'https://www.miamidadeclerk.gov/clerk/civil-court.page', 'Full foreclosure case docket, judge, status updates'],
                ].map(([name, url, desc]) => (
                  <div key={name} style={{ background: '#F4F0E8', border: '1px solid #DDD8CC', borderRadius: 5, padding: '10px 13px' }}>
                    <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 500, color: '#A88C38' }}>{name} →</a>
                    <div style={{ fontSize: 11, color: '#9A9488', marginTop: 2 }}>{desc}</div>
                  </div>
                ))}
              </div>
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

              <div style={{ marginTop: 12, textAlign: 'right' }}><span className="pending-tag">⏳ Pending — City of Miami Permits / Miami-Dade Building Dept</span></div>
            </div>
          )}

          {/* ── VALUATION ────────────────────────────────────────────────── */}
          {tab === 'Valuation' && (
            <div>
              <div className="alert alert-gold" style={{ marginBottom: 14 }}>
                All valuations are estimates — <strong>not an appraisal</strong>. Confidence: {p.valuation?.confidence}%. Source: {p.valuation?.source || 'MLS comps pending integration'}
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
              <div style={{ marginTop: 8, textAlign: 'right' }}><span className="pending-tag">⏳ Live comps pending — MLS / iMapp authorization required</span></div>
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

          {/* ── SOURCES ──────────────────────────────────────────────────── */}
          {tab === 'Sources' && (
            <div>
              <div style={{ fontSize: 12.5, color: '#9A9488', marginBottom: 14 }}>
                Each source below is configured independently. Sources marked "Pending" use sample data until live API credentials are configured on the backend. No credentials are stored in the frontend.
              </div>
              <table className="data-table">
                <thead><tr><th>Source</th><th>Data Fields</th><th>Last Checked</th><th>Confidence</th><th>Status</th></tr></thead>
                <tbody>
                  {(p.dataSources || []).map((s, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td style={{ fontSize: 11, color: '#9A9488' }}>—</td>
                      <td style={{ fontSize: 11 }}>{s.lastChecked || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 3, background: '#EDE8DC', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: s.confidence + '%', height: '100%', background: '#C8A84B', borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 10.5 }}>{s.confidence}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${s.status === 'live-link' || s.status === 'manual-import' ? 'green' : s.status === 'auth-required' ? 'blue' : 'gold'}`}>
                          {s.status === 'pending-integration' ? 'Pending' : s.status === 'live-link' ? 'Live Link' : s.status === 'auth-required' ? 'Auth Required' : 'Manual'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>

      {/* ── PAYWALL ───────────────────────────────────────────────────────── */}
      {!unlocked && (
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
      {payOpen && <PaymentModal folio={p.folio} address={`${p.address}, ${p.city} ${p.state}`} onClose={() => setPayOpen(false)} onSuccess={() => { setPayOpen(false); setUnlocked(true) }} />}
    </div>
  )
}
