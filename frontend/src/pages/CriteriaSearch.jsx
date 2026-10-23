import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import { useAuth } from '../utils/AuthContext'
import AuthModal from '../components/AuthModal'

const EMPTY = {
  counties: [], types: [], zip: '', city: '', street: '', subdivision: '', owner: '',
  minLiving: '', maxLiving: '', minLot: '', maxLot: '', minBeds: '', minBaths: '', minUnits: '', maxUnits: '',
  minYear: '', maxYear: '', minValue: '', maxValue: '',
  recentSale: false, minSale: '', maxSale: '',
  occupancy: '', ownerType: '', outOfState: false, sort: 'value_desc',
}

const COMING_SOON = ['Tax delinquent', 'Pre-foreclosure / lis pendens', 'Auction scheduled', 'Code violations', 'Open / expired permits', 'Probate']

const money = (n) => (n || n === 0) ? '$' + Number(n).toLocaleString() : '—'
const sqft = (n) => n ? Number(n).toLocaleString() : '—'
const date = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'

const S = {
  wrap: { display: 'grid', gridTemplateColumns: 'minmax(260px, 300px) 1fr', gap: 16, alignItems: 'start' },
  panel: { background: '#FAF8F2', border: '1px solid #D8D4C8', borderRadius: 10, padding: 16, position: 'sticky', top: 70, maxHeight: 'calc(100vh - 90px)', overflowY: 'auto' },
  group: { borderTop: '1px solid #E8E4D8', paddingTop: 12, marginTop: 12 },
  groupTitle: { fontSize: 9.5, letterSpacing: 2, textTransform: 'uppercase', color: '#A8863E', fontWeight: 600, marginBottom: 8 },
  pair: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  small: { fontSize: 12, padding: '7px 9px' },
  chip: (on) => ({
    border: `1px solid ${on ? '#C4A46B' : '#BFC4C7'}`, background: on ? '#F5EDD8' : '#FFFFFF',
    color: on ? '#8A6A2E' : '#506060', fontSize: 11, padding: '5px 9px', borderRadius: 4, cursor: 'pointer',
    fontFamily: 'inherit', fontWeight: on ? 600 : 400,
  }),
  hint: { fontSize: 10, color: '#9AA4A3', marginTop: 4, lineHeight: 1.4 },
}

function Range({ label, lo, hi, set, f, placeholder = ['Min', 'Max'] }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="form-label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={S.pair}>
        <input className="input" style={S.small} inputMode="numeric" placeholder={placeholder[0]} value={f[lo]} onChange={e => set(lo, e.target.value)} />
        <input className="input" style={S.small} inputMode="numeric" placeholder={placeholder[1]} value={f[hi]} onChange={e => set(hi, e.target.value)} />
      </div>
    </div>
  )
}

export default function CriteriaSearch() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [meta, setMeta] = useState(null)
  const [f, setF] = useState(EMPTY)
  const [res, setRes] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900)

  useEffect(() => {
    api.getCriteriaMeta().then(m => {
      setMeta(m)
      setF(p => ({ ...p, counties: m.counties.filter(c => c.properties > 0).map(c => c.slug) }))
    }).catch(() => setMeta({ counties: [], propertyTypes: [] }))
    const onResize = () => setNarrow(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const toggle = (k, v) => setF(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }))

  const bedsAvailable = meta?.counties?.some(c => c.slug === 'miami-dade' && c.hasBedsBaths && f.counties.includes('miami-dade'))

  const run = async (pg = 1, signedIn = false) => {
    if (!user && !signedIn) { setAuthOpen(true); return }
    if (!f.counties.length) { setError('Choose at least one county'); return }
    setError(''); setLoading(true); setPage(pg)
    try {
      const params = {
        county: f.counties.join(','), type: f.types.join(','), zip: f.zip, city: f.city, street: f.street,
        subdivision: f.subdivision, owner: f.owner,
        minLiving: f.minLiving, maxLiving: f.maxLiving, minLot: f.minLot, maxLot: f.maxLot,
        minBeds: f.minBeds, minBaths: f.minBaths, minUnits: f.minUnits, maxUnits: f.maxUnits,
        minYear: f.minYear, maxYear: f.maxYear, minValue: f.minValue, maxValue: f.maxValue,
        recentSale: f.recentSale ? 'true' : '', minSale: f.minSale, maxSale: f.maxSale,
        occupancy: f.occupancy, ownerType: f.ownerType,
        outOfState: f.outOfState ? 'true' : '', sort: f.sort, page: pg, pageSize: 50,
      }
      const r = await api.criteriaSearch(params)
      setRes(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const exportCsv = () => {
    if (!res?.results?.length) return
    const cols = ['county', 'address', 'city', 'zip', 'propertyType', 'beds', 'baths', 'livingSqft', 'lotSqft', 'yearBuilt', 'value', 'lastSalePrice', 'lastSaleDate', 'owner', 'ownerLocation', 'homestead', 'absentee', 'parcelId']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cols.join(','), ...res.results.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `mo-criteria-search-page${page}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = res ? Math.max(1, Math.ceil(res.total / res.pageSize)) : 1

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5 }}>Criteria Search</div>
        <div style={{ fontSize: 12, color: '#9A9488', marginTop: 3 }}>
          Find properties by location, size, age, value, sale history and owner indicators across Miami-Dade, Broward and Palm Beach.
        </div>
      </div>

      <div style={narrow ? { display: 'block' } : S.wrap}>
        {/* FILTERS */}
        <div style={narrow ? { ...S.panel, position: 'static', maxHeight: 'none', marginBottom: 14 } : S.panel}>
          <div style={S.groupTitle}>County</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(meta?.counties || []).map(c => (
              <label key={c.slug} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: c.properties ? 'pointer' : 'default', opacity: c.properties ? 1 : 0.55 }}>
                <input type="checkbox" disabled={!c.properties} checked={f.counties.includes(c.slug)} onChange={() => toggle('counties', c.slug)} />
                <span style={{ flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: 10, color: '#9AA4A3' }}>
                  {c.properties ? `${(c.properties / 1000).toFixed(0)}K` : c.loading ? 'Loading…' : 'Not loaded yet'}
                </span>
              </label>
            ))}
            {!meta && <div style={S.hint}>Loading counties…</div>}
          </div>

          <div style={S.group}>
            <div style={S.groupTitle}>Property Type</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {(meta?.propertyTypes || []).map(t => (
                <button key={t.key} type="button" style={S.chip(f.types.includes(t.key))} onClick={() => toggle('types', t.key)}>{t.label}</button>
              ))}
            </div>
          </div>

          <div style={S.group}>
            <div style={S.groupTitle}>Location</div>
            <input className="input" style={{ ...S.small, marginBottom: 6 }} placeholder="ZIP code(s), e.g. 33138, 33137" value={f.zip} onChange={e => set('zip', e.target.value)} />
            <input className="input" style={{ ...S.small, marginBottom: 6 }} placeholder="City, e.g. Miami Shores" value={f.city} onChange={e => set('city', e.target.value)} />
            <input className="input" style={{ ...S.small, marginBottom: 6 }} placeholder="Street contains, e.g. NE 83" value={f.street} onChange={e => set('street', e.target.value)} />
            <input className="input" style={S.small} placeholder="Subdivision (Miami-Dade)" value={f.subdivision} onChange={e => set('subdivision', e.target.value)} />
          </div>

          <div style={S.group}>
            <div style={S.groupTitle}>Size &amp; Rooms</div>
            <Range label="Living area (sq ft)" lo="minLiving" hi="maxLiving" set={set} f={f} />
            <Range label="Lot size (sq ft)" lo="minLot" hi="maxLot" set={set} f={f} />
            <div style={{ ...S.pair, marginBottom: 4 }}>
              <div>
                <div className="form-label" style={{ marginBottom: 4 }}>Beds (min)</div>
                <input className="input" style={S.small} inputMode="numeric" disabled={!bedsAvailable} placeholder="Any" value={f.minBeds} onChange={e => set('minBeds', e.target.value)} />
              </div>
              <div>
                <div className="form-label" style={{ marginBottom: 4 }}>Baths (min)</div>
                <input className="input" style={S.small} inputMode="decimal" disabled={!bedsAvailable} placeholder="Any" value={f.minBaths} onChange={e => set('minBaths', e.target.value)} />
              </div>
            </div>
            <div style={S.hint}>Beds and baths are available for Miami-Dade only. Using them leaves out Broward and Palm Beach properties.</div>
            <div style={{ marginTop: 8 }}><Range label="Residential units" lo="minUnits" hi="maxUnits" set={set} f={f} /></div>
            <Range label="Year built" lo="minYear" hi="maxYear" set={set} f={f} placeholder={['From', 'To']} />
          </div>

          <div style={S.group}>
            <div style={S.groupTitle}>Value &amp; Recent Sales</div>
            <Range label="Assessed (just) value $" lo="minValue" hi="maxValue" set={set} f={f} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, margin: '4px 0 8px' }}>
              <input type="checkbox" checked={f.recentSale} onChange={e => set('recentSale', e.target.checked)} /> Sold in the last 1–2 years
            </label>
            <Range label="Recent sale price $" lo="minSale" hi="maxSale" set={set} f={f} />
            <div style={S.hint}>The state tax roll only lists sales from the last 1–2 years. Older sale dates and "owned for X years" need full deed history from the county clerks (on the outreach list).</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#A8B4B3', marginTop: 8 }}>
              <input type="checkbox" disabled /> Owned 10+ years <span className="badge badge-gold" style={{ marginLeft: 'auto', fontSize: 8.5 }}>Soon</span>
            </label>
          </div>

          <div style={S.group}>
            <div style={S.groupTitle}>Owner</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {[['', 'Any'], ['owner', 'Owner-occupied (homestead)'], ['absentee', 'Absentee owner']].map(([v, l]) => (
                <button key={l} type="button" style={S.chip(f.occupancy === v)} onClick={() => set('occupancy', v)}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {[['', 'Any owner'], ['individual', 'Individual'], ['company', 'LLC / company'], ['trust', 'Trust / estate']].map(([v, l]) => (
                <button key={l} type="button" style={S.chip(f.ownerType === v)} onClick={() => set('ownerType', v)}>{l}</button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
              <input type="checkbox" checked={f.outOfState} onChange={e => set('outOfState', e.target.checked)} /> Out-of-state owner
            </label>
            <input className="input" style={S.small} placeholder="Owner name contains" value={f.owner} onChange={e => set('owner', e.target.value)} />
            <div style={S.hint}>Absentee = mailing address differs from the property. It's an indicator, not proof of vacancy.</div>
          </div>

          <div style={S.group}>
            <div style={S.groupTitle}>Distress Filters</div>
            {COMING_SOON.map(l => (
              <label key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#A8B4B3', marginBottom: 4 }}>
                <input type="checkbox" disabled /> {l} <span className="badge badge-gold" style={{ marginLeft: 'auto', fontSize: 8.5 }}>Soon</span>
              </label>
            ))}
            <div style={S.hint}>These turn on as county tax, clerk and permit sources are connected.</div>
          </div>

          <div style={{ ...S.group, display: 'flex', gap: 6 }}>
            <button className="btn btn-gold" style={{ flex: 1, justifyContent: 'center' }} onClick={() => run(1)} disabled={loading}>
              {loading ? 'Searching…' : 'Search →'}
            </button>
            <button className="btn btn-outline" onClick={() => { setF({ ...EMPTY, counties: f.counties }); setRes(null) }}>Reset</button>
          </div>
        </div>

        {/* RESULTS */}
        <div>
          {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

          {!res && !loading && (
            <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 40, color: '#9A9488', fontSize: 13 }}>
              Set your criteria and press <strong>Search</strong>.
              {!user && <div style={{ marginTop: 8 }}>Criteria search is for signed-in members. <button className="btn btn-gold btn-sm" style={{ marginLeft: 6 }} onClick={() => setAuthOpen(true)}>Sign in</button></div>}
            </div></div>
          )}

          {res && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{res.total.toLocaleString()}{res.totalCapped ? '+' : ''}</strong> properties
                  {res.totalCapped && <span style={{ fontSize: 11, color: '#9A9488' }}> — narrow your filters to see all</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select className="input" style={{ ...S.small, width: 'auto' }} value={f.sort} onChange={e => { set('sort', e.target.value) }}>
                    <option value="value_desc">Value: high → low</option>
                    <option value="value_asc">Value: low → high</option>
                    <option value="sale_new">Most recent sale</option>
                    <option value="living_desc">Largest home</option>
                    <option value="lot_desc">Largest lot</option>
                    <option value="year_old">Oldest built</option>
                    <option value="address">Address A–Z</option>
                  </select>
                  <button className="btn btn-outline btn-sm" onClick={() => run(1)}>Apply sort</button>
                  <button className="btn btn-outline btn-sm" onClick={exportCsv}>Export CSV</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 980 }}>
                  <thead>
                    <tr>
                      <th>Address</th><th>Type</th><th>Bd/Ba</th><th>Living</th><th>Lot</th><th>Built</th>
                      <th>Value</th><th>Last Sale</th><th>Owner</th><th>Indicators</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.results.map(r => (
                      <tr key={`${r.countySlug}-${r.parcelId}`} style={{ cursor: 'pointer' }} onClick={() => nav(`/report?q=${encodeURIComponent(r.reportKey)}`)}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#1A2828' }}>{r.address || '(no site address)'}</div>
                          <div style={{ fontSize: 10.5, color: '#9A9488' }}>{r.city} {r.zip} · {r.county}</div>
                        </td>
                        <td style={{ fontSize: 11 }}>{r.propertyType}{r.units > 1 ? ` · ${r.units} units` : ''}</td>
                        <td>{r.beds || r.baths ? `${r.beds ?? '—'}/${r.baths ?? '—'}` : '—'}</td>
                        <td>{sqft(r.livingSqft)}</td>
                        <td>{sqft(r.lotSqft)}</td>
                        <td>{r.yearBuilt || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{money(r.value)}</td>
                        <td><div>{money(r.lastSalePrice)}</div><div style={{ fontSize: 10.5, color: '#9A9488' }}>{date(r.lastSaleDate)}</div></td>
                        <td style={{ fontSize: 11, maxWidth: 180 }}>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.owner}</div>
                          <div style={{ fontSize: 10, color: '#9A9488' }}>{r.ownerLocation}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {r.homestead && <span className="badge badge-green" style={{ fontSize: 8.5 }}>Homestead</span>}
                            {r.absentee && <span className="badge badge-amber" style={{ fontSize: 8.5 }}>Absentee</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!res.results.length && (
                      <tr><td colSpan={10} style={{ textAlign: 'center', padding: 30, color: '#9A9488' }}>No properties match. Try widening a filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid #EDE8DC', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 10, color: '#9AA4A3', maxWidth: 520 }}>Source: {res.source}. Values are assessed values, not appraisals.</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn btn-outline btn-sm" disabled={page <= 1 || loading} onClick={() => run(page - 1)}>← Prev</button>
                  <span style={{ fontSize: 11 }}>Page {page} of {totalPages}</span>
                  <button className="btn btn-outline btn-sm" disabled={page >= totalPages || loading} onClick={() => run(page + 1)}>Next →</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} afterLogin={() => run(1, true)} />}
    </div>
  )
}
