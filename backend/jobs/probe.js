// backend/jobs/probe.js
// One-time discovery of public county map services (permits, code cases, liens…).
// Runs only when DATA_PROBE=on and writes findings to the server log as "[probe] …".

const fetch = require('node-fetch')

const ROOTS = [
  'https://gisweb.miamidade.gov/arcgis/rest/services',
  'https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/ArcGIS/rest/services',
  'https://gis.miami.gov/gis/rest/services',
  'https://gis.broward.org/arcgis/rest/services',
  'https://bcgis.broward.org/arcgis/rest/services',
  'https://gis.fortlauderdale.gov/arcgis/rest/services',
  'https://maps.co.palm-beach.fl.us/arcgis/rest/services',
  'https://gis.pbcgov.org/arcgis/rest/services',
]
const MATCH = /permit|code|violat|lien|unsafe|foreclos|delinq|certif|enforce|inspect/i

const get = async (url) => {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'f=json', { timeout: 20000 })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}
const log = (...a) => console.log('[probe]', ...a)

async function services(root) {
  const out = []
  const top = await get(root)
  const add = (base, list) => (list || []).forEach(s => out.push({ url: `${root}/${s.name}/${s.type}`, name: s.name, type: s.type }))
  add(root, top.services)
  for (const f of (top.folders || []).slice(0, 40)) {
    try { add(root, (await get(`${root}/${f}`)).services) } catch { /* skip folder */ }
  }
  return out
}

async function runProbe() {
  for (const root of ROOTS) {
    let list
    try { list = await services(root) } catch (e) { log(`${root} — unreachable (${e.message})`); continue }
    const hits = list.filter(s => MATCH.test(s.name) && /MapServer|FeatureServer/.test(s.type))
    log(`${root} — ${list.length} services, ${hits.length} relevant`)
    for (const s of hits.slice(0, 25)) {
      try {
        const info = await get(s.url)
        for (const layer of (info.layers || []).slice(0, 8)) {
          try {
            const L = await get(`${s.url}/${layer.id}`)
            const fields = (L.fields || []).map(f => f.name).slice(0, 40).join(',')
            log(`LAYER ${s.url}/${layer.id} | ${layer.name} | max ${L.maxRecordCount || '?'} | ${fields}`)
          } catch (e) { log(`LAYER ${s.url}/${layer.id} | ${layer.name} | error ${e.message}`) }
        }
      } catch (e) { log(`SERVICE ${s.url} error ${e.message}`) }
    }
  }

  /* Keys already saved on Railway — check only that they are present and their kind (no paid calls) */
  const mb = process.env.MAPBOX_TOKEN || ''
  log(`MAPBOX_TOKEN: ${mb ? (mb.startsWith('pk.') ? 'public token present' : mb.startsWith('sk.') ? 'secret token present' : 'present, unknown format') : 'missing'}`)
  log(`BATCH_SKIP_API_KEY: ${process.env.BATCH_SKIP_API_KEY ? `present (${process.env.BATCH_SKIP_API_KEY.length} chars)` : 'missing'}`)
  const gk = process.env.GOOGLE_MAPS_KEY
  if (gk) {
    try {
      /* Street View metadata requests are free */
      const r = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent('100 NE 90th St, Miami Shores, FL')}&key=${gk}`, { timeout: 15000 })
      const j = await r.json()
      log(`GOOGLE_MAPS_KEY: present — Street View metadata status ${j.status}${j.error_message ? ` (${j.error_message.slice(0, 120)})` : ''}`)
    } catch (e) { log(`GOOGLE_MAPS_KEY: present — check failed ${e.message}`) }
  } else log('GOOGLE_MAPS_KEY: missing')
  log('done')
}

function startProbe() {
  if (process.env.DATA_PROBE !== 'on') return
  setTimeout(() => runProbe().catch(e => log('failed', e.message)), 20 * 1000)
}

module.exports = { startProbe, runProbe }
