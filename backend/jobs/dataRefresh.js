// backend/jobs/dataRefresh.js
// Keeps county property data current: checks the state tax roll daily and reloads a
// county only when a newer file is published. Runs inside the backend on Railway.

const { pool, query } = require('../db/pool')
const { COUNTIES } = require('../config/counties')
const { findLatestFile, importCounty } = require('../adapters/fdorRoll')
const { enrichMiamiDade } = require('../adapters/mdpaEnrich')
const { findLatestPinFile, importPins } = require('../adapters/fdorPins')
const publicRecords = require('../adapters/publicRecords')
const { assignCondoPoints } = require('../adapters/condoPoints')

const LOCK_KEY = 778899
/* Railway Hobby volumes max out at 5 GB — stop loading well before the disk fills */
const MAX_DB_BYTES = Number(process.env.DATA_MAX_DB_MB || 3800) * 1024 * 1024

async function dbTooBig() {
  const r = await query('SELECT pg_database_size(current_database())::bigint AS bytes')
  const bytes = Number(r.rows[0].bytes)
  if (bytes > MAX_DB_BYTES) {
    console.error(`[data] database is ${(bytes / 1048576).toFixed(0)} MB — over the ${(MAX_DB_BYTES / 1048576).toFixed(0)} MB safety limit, skipping county loads`)
    return true
  }
  return false
}
const DAY = 24 * 60 * 60 * 1000
let running = false

async function lastDone(countyNo, source) {
  const r = await query(
    `SELECT * FROM data_imports WHERE county_no=$1 AND source=$2 AND status='done' ORDER BY finished_at DESC LIMIT 1`,
    [countyNo, source]
  )
  return r.rows[0] || null
}

async function runOnce() {
  if (running) return
  running = true
  const lockClient = await pool.connect()
  try {
    const got = await lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY])
    if (!got.rows[0].ok) { console.log('[data] another refresh is running — skipping'); return }

    /* A load interrupted by a restart is marked failed so it is retried */
    await query(`UPDATE data_imports SET status='failed', error='Interrupted', finished_at=NOW()
                 WHERE status='running' AND started_at < NOW() - INTERVAL '3 hours'`)

    for (const county of Object.values(COUNTIES)) {
      try {
        const file = await findLatestFile(county)
        if (!file) { console.log(`[data] ${county.name}: no state roll file found`); continue }

        const done = await lastDone(county.no, 'fdor-nal')
        let isNew = !done || done.file_name !== file.name ||
          (file.modified && new Date(file.modified) > new Date(done.file_modified || 0))
        /* One-time reload so Broward and Palm Beach get subdivision names from the legal description */
        if (!isNew && county.no !== 23) {
          const hasSub = await query('SELECT 1 FROM parcels WHERE county_no=$1 AND subdivision IS NOT NULL LIMIT 1', [county.no])
          if (!hasSub.rows.length) { isNew = true; console.log(`[data] ${county.name}: reloading to add subdivision names`) }
        }

        if (isNew) {
          if (await dbTooBig()) break
          await importCounty(county, file)
        } else {
          console.log(`[data] ${county.name}: up to date (${file.name})`)
        }

        if (county.hasBedsBaths && county.no === 23) {
          const roll = await lastDone(23, 'fdor-nal')
          const enrich = await lastDone(23, 'mdpa-enrich')
          const stale = !enrich || (roll && new Date(enrich.finished_at) < new Date(roll.finished_at)) ||
            Date.now() - new Date(enrich.finished_at).getTime() > 30 * DAY
          if (roll && stale && !(await dbTooBig())) await enrichMiamiDade()
        }

        /* Map points: reload only when a newer state map file is published */
        const pin = await findLatestPinFile(county)
        if (pin) {
          const donePin = await lastDone(county.no, 'fdor-pin')
          const newPin = !donePin || donePin.file_name !== pin.name ||
            (pin.modified && new Date(pin.modified) > new Date(donePin.file_modified || 0))
          if (newPin && !(await dbTooBig())) await importPins(county, pin)
        }
      } catch (e) {
        console.error(`[data] ${county.name}: refresh error —`, e.message)
      }
    }
    /* Condo / co-op units: place them at their building so the map shows one dot per building */
    try { if (!(await dbTooBig())) await assignCondoPoints() } catch (e) { console.error('[map] condo placement error —', e.message) }

    /* Map area search: cities and subdivisions with their center points */
    try { await buildAreas() } catch (e) { console.error('[areas] build error —', e.message) }

    /* County & city records (code cases, liens, violations) — small, refreshed every run */
    try { await publicRecords.syncAll() } catch (e) { console.error('[records] sync error —', e.message) }
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {})
    lockClient.release()
    running = false
  }
}

async function buildAreas() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM map_areas')
    await client.query(`
      INSERT INTO map_areas (county_no, kind, name, lat, lng, n)
      SELECT p.county_no, 'subdivision', INITCAP(p.subdivision), AVG(pt.lat), AVG(pt.lng), COUNT(*)
        FROM parcels p JOIN parcel_points pt ON pt.county_no = p.county_no AND pt.parcel_id = p.parcel_id
       WHERE p.subdivision IS NOT NULL
       GROUP BY p.county_no, INITCAP(p.subdivision) HAVING COUNT(*) >= 3
      ON CONFLICT DO NOTHING`)
    await client.query(`
      INSERT INTO map_areas (county_no, kind, name, lat, lng, n)
      SELECT p.county_no, 'city', INITCAP(p.phy_city), AVG(pt.lat), AVG(pt.lng), COUNT(*)
        FROM parcels p JOIN parcel_points pt ON pt.county_no = p.county_no AND pt.parcel_id = p.parcel_id
       WHERE p.phy_city IS NOT NULL AND p.phy_city <> ''
       GROUP BY p.county_no, INITCAP(p.phy_city) HAVING COUNT(*) >= 20
      ON CONFLICT DO NOTHING`)
    await client.query('COMMIT')
    const n = await client.query('SELECT kind, COUNT(*)::int AS n FROM map_areas GROUP BY 1')
    console.log('[areas] map areas ready —', n.rows.map(r => `${r.n} ${r.kind === 'city' ? 'cities' : 'subdivisions'}`).join(', '))
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

function startDataRefresh() {
  const enabled = process.env.DATA_REFRESH ? process.env.DATA_REFRESH !== 'off' : process.env.NODE_ENV === 'production'
  if (!enabled) { console.log('[data] automatic county refresh is off'); return }
  setTimeout(() => runOnce().catch(e => console.error('[data] refresh failed —', e.message)), 60 * 1000)
  setInterval(() => runOnce().catch(e => console.error('[data] refresh failed —', e.message)), DAY)
}

module.exports = { startDataRefresh, runOnce, buildAreas }
