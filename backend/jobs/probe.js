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

  /* Broward Official Records — public daily index files (county publishes the login: crpublic / crpublic) */
  try {
    const SftpClient = require('ssh2-sftp-client')
    const sftp = new SftpClient()
    await sftp.connect({ host: 'BCFTP.Broward.org', port: 22, username: 'crpublic', password: 'crpublic', readyTimeout: 20000 })
    const walk = async (dir, depth) => {
      const items = await sftp.list(dir)
      for (const it of items.slice(0, 30)) {
        const p = `${dir === '/' ? '' : dir}/${it.name}`
        log(`BCFTP ${it.type} ${p} ${it.size} ${new Date(it.modifyTime).toISOString().slice(0, 10)}`)
        if (it.type === 'd' && depth < 2) await walk(p, depth + 1)
      }
      return items
    }
    await walk('/', 0)
    /* Peek at the newest small text-like file */
    const peek = async (dir) => {
      const items = (await sftp.list(dir)).filter(i => i.type === '-' && i.size > 0 && i.size < 50e6 && !/\.(tif|tiff|pdf|jpg|png)$/i.test(i.name))
      items.sort((a, b) => b.modifyTime - a.modifyTime)
      return items[0] ? `${dir === '/' ? '' : dir}/${items[0].name}` : null
    }
    let target = await peek('/')
    if (!target) {
      for (const d of (await sftp.list('/')).filter(i => i.type === 'd')) { target = await peek(`/${d.name}`); if (target) break }
    }
    if (target) {
      const chunks = []
      await new Promise((resolve, reject) => {
        const st = sftp.sftp.createReadStream(target, { start: 0, end: 2500 })
        st.on('data', c => chunks.push(c)); st.on('end', resolve); st.on('error', reject)
      })
      const head = Buffer.concat(chunks)
      log(`BCFTP sample ${target} (zip=${head[0] === 0x50 && head[1] === 0x4b})`)
      if (!(head[0] === 0x50 && head[1] === 0x4b)) head.toString('latin1').split(/\r?\n/).slice(0, 8).forEach(l => log(`BCFTP | ${l.slice(0, 300)}`))
    }
    await sftp.end()
  } catch (e) { log(`BCFTP error ${e.message}`) }

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
