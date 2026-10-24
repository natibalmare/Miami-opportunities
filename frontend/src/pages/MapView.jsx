import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api } from '../utils/api'

const STYLE = 'https://tiles.openfreemap.org/styles/positron'

const PLACES = [
  ['Miami Shores', 25.8632, -80.1928], ['Morningside', 25.8215, -80.1840], ['Belle Meade', 25.8460, -80.1830],
  ['El Portal', 25.8551, -80.1950], ['Upper East Side / MiMo', 25.8360, -80.1850], ['Shorecrest', 25.8545, -80.1810],
  ['North Miami', 25.8901, -80.1867], ['North Miami Beach', 25.9331, -80.1625], ['Hollywood', 26.0112, -80.1495],
  ['Dania Beach', 26.0523, -80.1439], ['Hallandale Beach', 25.9812, -80.1484], ['Fort Lauderdale', 26.1224, -80.1373],
  ['West Palm Beach', 26.7153, -80.0534], ['Boca Raton', 26.3683, -80.1289],
]

const LISTS = [
  ['', 'All properties'], ['absentee', 'Absentee owners'], ['out-of-state', 'Out-of-state owners'],
  ['trust', 'Trust & estate owned'], ['llc', 'LLC / company owned'], ['landlords', 'Small landlords'],
  ['older', 'Older homes (pre-1970)'], ['vacant-land', 'Vacant land'], ['recent', 'Recently sold'],
]

const TYPES = [
  ['', 'All types'], ['single-family', 'Single Family'], ['condo', 'Condo'], ['multi-small', 'Multi-Family (2–9)'],
  ['multi-large', 'Multi-Family (10+)'], ['vacant-res', 'Vacant Residential'], ['commercial', 'Commercial'],
]

const LEGEND = [['#B84040', '76–100 High priority'], ['#C8A84B', '51–75 Strong lead'], ['#3E8E8A', '26–50 Possible lead'], ['#9AA4A3', '0–25 Low']]

const money = (n) => (n || n === 0) ? '$' + Number(n).toLocaleString() : '—'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export default function MapView() {
  const nav = useNavigate()
  const box = useRef(null)
  const map = useRef(null)
  const reqId = useRef(0)
  const timer = useRef(null)
  const [list, setList] = useState('')
  const [type, setType] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [status, setStatus] = useState({ loading: false, count: 0, zoomIn: false, error: '' })
  const filters = useRef({ list, type, minScore })
  filters.current = { list, type, minScore }

  const load = useCallback(async () => {
    const m = map.current
    if (!m || !m.getSource('parcels')) return
    const b = m.getBounds()
    const id = ++reqId.current
    setStatus(s => ({ ...s, loading: true, error: '' }))
    try {
      const r = await api.mapParcels({
        minLat: b.getSouth().toFixed(5), maxLat: b.getNorth().toFixed(5),
        minLng: b.getWest().toFixed(5), maxLng: b.getEast().toFixed(5),
        list: filters.current.list, type: filters.current.type, minScore: filters.current.minScore || '',
      })
      if (id !== reqId.current) return
      m.getSource('parcels').setData({
        type: 'FeatureCollection',
        features: (r.points || []).map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: p })),
      })
      setStatus({ loading: false, count: (r.points || []).length, zoomIn: !!r.zoomIn, error: '' })
    } catch (e) {
      if (id !== reqId.current) return
      setStatus({ loading: false, count: 0, zoomIn: false, error: 'Map data is temporarily unavailable. Please try again.' })
    }
  }, [])

  const schedule = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, 350)
  }, [load])

  useEffect(() => {
    const m = new maplibregl.Map({ container: box.current, style: STYLE, center: [-80.188, 25.855], zoom: 14.5, attributionControl: { compact: true } })
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right')

    m.on('load', () => {
      m.addSource('parcels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({
        id: 'parcels', type: 'circle', source: 'parcels',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3.5, 16, 7, 18, 10],
          'circle-color': ['step', ['get', 'score'], '#9AA4A3', 26, '#3E8E8A', 51, '#C8A84B', 76, '#B84040'],
          'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.2, 'circle-opacity': 0.92,
        },
      })
      m.on('mouseenter', 'parcels', () => { m.getCanvas().style.cursor = 'pointer' })
      m.on('mouseleave', 'parcels', () => { m.getCanvas().style.cursor = '' })
      m.on('click', 'parcels', (e) => {
        const p = e.features[0].properties
        const facts = [p.type, p.beds && p.beds !== 'null' ? `${p.beds} bd` : '', p.baths && p.baths !== 'null' ? `${p.baths} ba` : '',
          p.livingSqft && p.livingSqft !== 'null' ? `${Number(p.livingSqft).toLocaleString()} sqft` : '',
          p.yearBuilt && p.yearBuilt !== 'null' && Number(p.yearBuilt) > 0 ? `Built ${p.yearBuilt}` : ''].filter(Boolean).join(' · ')
        const el = document.createElement('div')
        el.style.cssText = 'font-family:inherit;min-width:210px'
        el.innerHTML = `
          <div style="font-size:13.5px;font-weight:600;color:#0A3D3A">${esc(p.address)}</div>
          <div style="font-size:11.5px;color:#5A6A69;margin:2px 0 8px">${esc([p.city, p.zip].filter(x => x && x !== 'null').join(', '))}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:11px;color:#5A6A69">Opportunity Score</span>
            <span style="font-size:15px;font-weight:700;color:#0A3D3A">${esc(p.score)}<span style="font-size:10px;font-weight:400;color:#5A6A69"> / 100</span></span>
          </div>
          <div style="font-size:11px;color:#8A6A2E;margin-bottom:6px">${esc(p.label)}</div>
          <div style="font-size:11.5px;color:#3E4A49;margin-bottom:4px">${esc(facts)}</div>
          <div style="font-size:11.5px;color:#3E4A49;margin-bottom:10px">Assessed value: ${esc(money(Number(p.value) || null))}</div>`
        const btn = document.createElement('button')
        btn.className = 'btn btn-gold btn-sm'
        btn.style.width = '100%'
        btn.textContent = 'Open Property Report →'
        btn.onclick = () => nav(`/report?q=${encodeURIComponent(p.reportKey)}`)
        el.appendChild(btn)
        new maplibregl.Popup({ offset: 10, maxWidth: '280px' }).setLngLat(e.features[0].geometry.coordinates).setDOMContent(el).addTo(m)
      })
      load()
    })
    m.on('moveend', schedule)
    return () => { clearTimeout(timer.current); m.remove(); map.current = null }
  }, [load, schedule, nav])

  useEffect(() => { schedule() }, [list, type, minScore, schedule])

  const goTo = (name) => {
    const p = PLACES.find(x => x[0] === name)
    if (p && map.current) map.current.flyTo({ center: [p[2], p[1]], zoom: 15 })
  }

  const label = { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#5A6A69', fontWeight: 600, marginBottom: 6, display: 'block' }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5 }}>Map View</div>
        <div style={{ fontSize: 12, color: '#9A9488', marginTop: 3 }}>Every property in Miami-Dade, Broward and Palm Beach, colored by Opportunity Score. Click a pin for details.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, alignItems: 'start' }} className="map-layout">
        <div className="card" style={{ gridColumn: 'span 1' }}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <span style={label}>Go to area</span>
              <select className="input" defaultValue="" onChange={e => { goTo(e.target.value); e.target.value = '' }}>
                <option value="" disabled>Choose a neighborhood…</option>
                {PLACES.map(([n]) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Lead list</span>
              <select className="input" value={list} onChange={e => setList(e.target.value)}>
                {LISTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Property type</span>
              <select className="input" value={type} onChange={e => setType(e.target.value)}>
                {TYPES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Minimum score: {minScore}</span>
              <input type="range" min={0} max={90} step={5} value={minScore} onChange={e => setMinScore(Number(e.target.value))} style={{ width: '100%', accentColor: '#C8A84B' }} />
            </div>
            <div>
              <span style={label}>Opportunity Score</span>
              {LEGEND.map(([c, t]) => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#3E4A49', padding: '2px 0' }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: c, border: '1.5px solid #fff', boxShadow: '0 0 0 1px #DDD8CC' }} />{t}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ gridColumn: '1 / -1', position: 'relative' }} className="map-canvas-wrap">
          <div ref={box} style={{ height: 'min(72vh, 680px)', minHeight: 420, borderRadius: 10, overflow: 'hidden', border: '1px solid #E0DCD0' }} />
          <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.95)', border: '1px solid #E0DCD0', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#3E4A49', maxWidth: 'calc(100% - 70px)' }}>
            {status.error ? <span style={{ color: '#B84040' }}>{status.error}</span>
              : status.zoomIn ? 'Zoom in to see properties'
              : status.loading ? 'Loading properties…'
              : `${status.count.toLocaleString()} properties shown${status.count >= 800 ? ' (top scores — zoom in for more)' : ''}`}
          </div>
        </div>
      </div>

      <div className="legal-notice" style={{ marginTop: 14 }}>
        Pin locations are approximate. Opportunity Scores are estimates based on public records and are not a statement that an owner wants or needs to sell. Verify all information independently.
      </div>

      <style>{`
        @media (min-width: 900px) {
          .map-layout { grid-template-columns: 250px 1fr !important; }
          .map-canvas-wrap { grid-column: 2 / 3 !important; }
        }
        .maplibregl-popup-content { border-radius: 8px; padding: 12px 14px; box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
      `}</style>
    </div>
  )
}
