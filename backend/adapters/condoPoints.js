// backend/adapters/condoPoints.js
// Condo and co-op units usually have no shape of their own on the state parcel map — only the building does.
// Give each unit without a map point the location of a parcel at the same street address (the building),
// so the map can show one dot per building with all of its units.

const { query } = require('../db/pool')

const BASE = (col) => `regexp_replace(UPPER(${col}), '\\s+(#|UNIT|APT|STE|SUITE|PH|BLDG|NO\\.?|U)\\s*[A-Z0-9-]+.*$', '')`

async function assignCondoPoints() {
  const t0 = Date.now()
  /* How many properties still have no map location, per county, with a few sample addresses */
  try {
    const d = await query(`SELECT p.county_no, COUNT(*)::int AS n, (array_agg(p.phy_addr1 ORDER BY random()))[1:5] AS samples
      FROM parcels p LEFT JOIN parcel_points pt ON pt.county_no = p.county_no AND pt.parcel_id = p.parcel_id
      WHERE pt.parcel_id IS NULL GROUP BY 1`)
    d.rows.forEach(r => console.log(`[map] county ${r.county_no}: ${r.n.toLocaleString()} properties without a map point — e.g. ${(r.samples || []).join(' | ')}`))
  } catch (e) { console.error('[map] point check failed —', e.message) }
  const r = await query(`
    WITH missing AS (
      SELECT p.county_no, p.parcel_id, ${BASE('p.phy_addr1')} AS base, p.phy_zip
        FROM parcels p
        LEFT JOIN parcel_points pt ON pt.county_no = p.county_no AND pt.parcel_id = p.parcel_id
       WHERE pt.parcel_id IS NULL AND p.phy_addr1 IS NOT NULL AND p.phy_zip IS NOT NULL
    ),
    anchors AS (
      SELECT DISTINCT ON (p.county_no, ${BASE('p.phy_addr1')}, p.phy_zip)
             p.county_no, ${BASE('p.phy_addr1')} AS base, p.phy_zip, pt.lat, pt.lng
        FROM parcels p
        JOIN parcel_points pt ON pt.county_no = p.county_no AND pt.parcel_id = p.parcel_id
       WHERE p.phy_addr1 IS NOT NULL AND p.phy_zip IS NOT NULL
         AND (pt.import_id IS NULL OR pt.import_id > 0)
         AND p.county_no IN (SELECT DISTINCT county_no FROM missing)
         AND ${BASE('p.phy_addr1')} IN (SELECT base FROM missing)
       ORDER BY p.county_no, ${BASE('p.phy_addr1')}, p.phy_zip, p.dor_uc
    )
    INSERT INTO parcel_points (county_no, parcel_id, lat, lng, import_id)
    SELECT m.county_no, m.parcel_id, a.lat, a.lng, -1
      FROM missing m JOIN anchors a ON a.county_no = m.county_no AND a.base = m.base AND a.phy_zip = m.phy_zip
     WHERE length(m.base) > 4
    ON CONFLICT (county_no, parcel_id) DO NOTHING`)
  console.log(`[map] condo / co-op units placed at their building: ${Number(r.rowCount || 0).toLocaleString()} (${Math.round((Date.now() - t0) / 1000)}s)`)
  return r.rowCount
}

module.exports = { assignCondoPoints }
