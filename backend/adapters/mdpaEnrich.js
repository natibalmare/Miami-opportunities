// backend/adapters/mdpaEnrich.js
// Adds bedrooms, bathrooms and subdivision to Miami-Dade parcels from the
// Miami-Dade Property Appraiser public GIS layer (the state roll has no beds/baths).

const fetch = require('node-fetch')
const { pool } = require('../db/pool')

const LAYER = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/26/query'
const PAGE = 1000
const PAUSE_MS = 300

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function page(afterId) {
  const params = new URLSearchParams({
    where: `OBJECTID > ${afterId}`,
    outFields: 'OBJECTID,FOLIO,BEDROOM_COUNT,BATHROOM_COUNT,HALF_BATHROOM_COUNT,SUBDIVISION',
    orderByFields: 'OBJECTID',
    resultRecordCount: String(PAGE),
    returnGeometry: 'false',
    f: 'json',
  })
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${LAYER}?${params}`, { timeout: 30000 })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error.message || 'ArcGIS error')
      return (json.features || []).map(f => f.attributes)
    } catch (e) {
      if (attempt === 3) throw e
      await sleep(2000 * attempt)
    }
  }
  return []
}

async function enrichMiamiDade() {
  const client = await pool.connect()
  let importId = null
  try {
    const ins = await client.query(
      `INSERT INTO data_imports (county_no, source, file_name) VALUES (23,'mdpa-enrich','MDPA parcels layer 26') RETURNING id`
    )
    importId = ins.rows[0].id
    console.log('[data] Miami-Dade: adding beds/baths from the Property Appraiser')

    let lastId = 0, seen = 0, matched = 0
    for (;;) {
      const rows = await page(lastId)
      if (!rows.length) break
      lastId = rows[rows.length - 1].OBJECTID
      seen += rows.length

      const folios = [], beds = [], baths = [], subs = []
      for (const r of rows) {
        if (!r.FOLIO) continue
        const full = Number(r.BATHROOM_COUNT) || 0
        const half = Number(r.HALF_BATHROOM_COUNT) || 0
        folios.push(String(r.FOLIO).trim())
        beds.push(Number(r.BEDROOM_COUNT) > 0 ? Number(r.BEDROOM_COUNT) : null)
        baths.push(full + half > 0 ? full + half * 0.5 : null)
        subs.push(r.SUBDIVISION ? String(r.SUBDIVISION).trim() : null)
      }
      if (folios.length) {
        const u = await client.query(
          `UPDATE parcels p SET beds = v.beds, baths = v.baths, subdivision = v.sub
             FROM unnest($1::text[], $2::smallint[], $3::numeric[], $4::text[]) AS v(folio, beds, baths, sub)
            WHERE p.county_no = 23 AND p.parcel_id = v.folio`,
          [folios, beds, baths, subs]
        )
        matched += u.rowCount
      }
      if (seen % 50000 < PAGE) {
        console.log(`[data] Miami-Dade beds/baths: ${seen.toLocaleString()} checked, ${matched.toLocaleString()} matched`)
        await client.query('UPDATE data_imports SET rows_loaded=$1 WHERE id=$2', [matched, importId])
      }
      if (seen >= 5000 && matched === 0) throw new Error('Folio numbers do not match the state roll — stopping')
      await sleep(PAUSE_MS)
    }

    await client.query(`UPDATE data_imports SET status='done', rows_loaded=$1, finished_at=NOW() WHERE id=$2`, [matched, importId])
    console.log(`[data] Miami-Dade beds/baths: done — ${matched.toLocaleString()} properties updated`)
    return matched
  } catch (e) {
    console.error('[data] Miami-Dade beds/baths failed —', e.message)
    if (importId) await client.query(`UPDATE data_imports SET status='failed', error=$1, finished_at=NOW() WHERE id=$2`, [e.message.slice(0, 500), importId]).catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

module.exports = { enrichMiamiDade }
