// backend/jobs/dataRefresh.js
// Keeps county property data current: checks the state tax roll daily and reloads a
// county only when a newer file is published. Runs inside the backend on Railway.

const { pool, query } = require('../db/pool')
const { COUNTIES } = require('../config/counties')
const { findLatestFile, importCounty } = require('../adapters/fdorRoll')
const { enrichMiamiDade } = require('../adapters/mdpaEnrich')
const { findLatestPinFile, importPins } = require('../adapters/fdorPins')

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
        const isNew = !done || done.file_name !== file.name ||
          (file.modified && new Date(file.modified) > new Date(done.file_modified || 0))

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
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {})
    lockClient.release()
    running = false
  }
}

function startDataRefresh() {
  const enabled = process.env.DATA_REFRESH ? process.env.DATA_REFRESH !== 'off' : process.env.NODE_ENV === 'production'
  if (!enabled) { console.log('[data] automatic county refresh is off'); return }
  setTimeout(() => runOnce().catch(e => console.error('[data] refresh failed —', e.message)), 60 * 1000)
  setInterval(() => runOnce().catch(e => console.error('[data] refresh failed —', e.message)), DAY)
}

module.exports = { startDataRefresh, runOnce }
