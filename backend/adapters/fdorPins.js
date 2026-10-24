// backend/adapters/fdorPins.js
// Florida Department of Revenue parcel map files ("PIN" shapefiles, one per county).
// Each parcel polygon is reduced to one map point (lat/lng) and joined to the tax roll by PARCELNO = PARCEL_ID.

const fs = require('fs')
const os = require('os')
const path = require('path')
const fetch = require('node-fetch')
const unzipper = require('unzipper')
const shapefile = require('shapefile')
const proj4 = require('proj4')
const { pool } = require('../db/pool')

const SITE = 'https://floridarevenue.com'
const MAP_DIR = '/property/dataportal/Documents/PTO Data Portal/Map Data'
const API = `${SITE}/property/dataportal/_api/web/GetFolderByServerRelativeUrl`
const JSON_HEADERS = { Accept: 'application/json;odata=nometadata' }
const BATCH = 2000

async function list(kind, folderPath) {
  const url = `${API}('${encodeURI(folderPath.replace(/'/g, "''"))}')/${kind}`
  const res = await fetch(url, { headers: JSON_HEADERS, timeout: 30000 })
  if (!res.ok) throw new Error(`FDOR map listing failed (${res.status})`)
  return (await res.json()).value || []
}

/* Newest "YYYYF/YYYYF PIN" file for the county */
async function findLatestPinFile(county) {
  if (!county.pinFile) return null
  const years = (await list('Folders', MAP_DIR)).map(f => f.Name).filter(n => /^\d{4}F$/.test(n)).sort().reverse()
  for (const y of years) {
    let files = []
    try { files = await list('Files', `${MAP_DIR}/${y}/${y} PIN`) } catch { continue }
    const hit = files.find(f => county.pinFile.test(f.Name))
    if (hit) return { name: hit.Name, modified: hit.TimeLastModified, size: Number(hit.Length) || null, url: SITE + encodeURI(hit.ServerRelativeUrl) }
  }
  return null
}

async function download(url, dest) {
  const res = await fetch(url, { timeout: 0 })
  if (!res.ok) throw new Error(`Map download failed (${res.status})`)
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest)
    res.body.pipe(out)
    res.body.on('error', reject)
    out.on('finish', resolve)
    out.on('error', reject)
  })
}

/* Center of a polygon's bounding box — a good map pin for a parcel */
function bboxCenter(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0]
      if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1]
    } else c.forEach(walk)
  }
  if (!geom || !geom.coordinates) return null
  walk(geom.coordinates)
  if (!Number.isFinite(minX)) return null
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}

async function writeBatch(client, rows, countyNo, importId) {
  const seen = new Map()
  for (const r of rows) seen.set(r[0], r)
  const u = [...seen.values()]
  await client.query(
    `INSERT INTO parcel_points (county_no, parcel_id, lat, lng, import_id)
     SELECT $1::smallint, p, la, ln, $5::int FROM unnest($2::text[], $3::real[], $4::real[]) AS t(p, la, ln)
     ON CONFLICT (county_no, parcel_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, import_id = EXCLUDED.import_id`,
    [countyNo, u.map(r => r[0]), u.map(r => r[1]), u.map(r => r[2]), importId]
  )
  return u.length
}

async function importPins(county, file) {
  const client = await pool.connect()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pin-${county.no}-`))
  const zipPath = path.join(dir, 'pins.zip')
  let importId = null
  try {
    const ins = await client.query(
      `INSERT INTO data_imports (county_no, source, file_name, file_modified) VALUES ($1,'fdor-pin',$2,$3) RETURNING id`,
      [county.no, file.name, file.modified]
    )
    importId = ins.rows[0].id
    console.log(`[map] ${county.name}: downloading ${file.name}`)
    await download(file.url, zipPath)

    const zip = await unzipper.Open.file(zipPath)
    const pick = (ext) => zip.files.find(f => f.path.toLowerCase().endsWith(ext) && !/__macosx/i.test(f.path))
    const shp = pick('.shp'), dbf = pick('.dbf'), prj = pick('.prj')
    if (!shp || !dbf) throw new Error('Shapefile parts missing in ZIP')
    const extract = (entry, name) => new Promise((resolve, reject) => {
      const p = path.join(dir, name)
      entry.stream().pipe(fs.createWriteStream(p)).on('finish', () => resolve(p)).on('error', reject)
    })
    const shpPath = await extract(shp, 'p.shp')
    const dbfPath = await extract(dbf, 'p.dbf')
    fs.promises.unlink(zipPath).catch(() => {})
    const wkt = prj ? (await prj.buffer()).toString('utf8') : null
    const toWgs = wkt ? proj4(wkt, 'EPSG:4326') : null

    const source = await shapefile.open(shpPath, dbfPath, { encoding: 'latin1' })
    let batch = [], loaded = 0, checked = false
    for (;;) {
      const { done, value } = await source.read()
      if (done) break
      const props = value.properties || {}
      const id = String(props.PARCELNO ?? props.PARCEL_ID ?? props.PARCELID ?? '').trim()
      const c = bboxCenter(value.geometry)
      if (!id || !c) continue
      const [lng, lat] = toWgs ? toWgs.forward(c) : c
      if (!checked) {
        if (!(lat > 24 && lat < 31.5 && lng > -88 && lng < -79)) throw new Error(`Map coordinates look wrong (${lat}, ${lng}) — projection not recognized`)
        checked = true
      }
      batch.push([id, lat, lng])
      if (batch.length >= BATCH) {
        loaded += await writeBatch(client, batch, county.no, importId)
        batch = []
        if (loaded % 100000 < BATCH) console.log(`[map] ${county.name}: ${loaded.toLocaleString()} map points`)
      }
    }
    if (batch.length) loaded += await writeBatch(client, batch, county.no, importId)
    if (loaded < 1000) throw new Error(`Only ${loaded} map points found`)

    await client.query('DELETE FROM parcel_points WHERE county_no=$1 AND import_id IS DISTINCT FROM $2', [county.no, importId])
    await client.query(`UPDATE data_imports SET status='done', rows_loaded=$1, finished_at=NOW() WHERE id=$2`, [loaded, importId])
    console.log(`[map] ${county.name}: done — ${loaded.toLocaleString()} map points`)
    return loaded
  } catch (e) {
    console.error(`[map] ${county.name}: failed —`, e.message)
    if (importId) await client.query(`UPDATE data_imports SET status='failed', error=$1, finished_at=NOW() WHERE id=$2`, [e.message.slice(0, 500), importId]).catch(() => {})
    throw e
  } finally {
    client.release()
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

module.exports = { findLatestPinFile, importPins, bboxCenter }
