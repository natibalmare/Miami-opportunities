// backend/adapters/fdorRoll.js
// Florida Department of Revenue — Property Tax Oversight "NAL" tax roll files (one per county).
// Source: https://floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx
// Public files; confidential records are excluded by the Department. Updated as each county submits its roll.

const fs = require('fs')
const os = require('os')
const path = require('path')
const fetch = require('node-fetch')
const unzipper = require('unzipper')
const { parse } = require('csv-parse')
const { pool } = require('../db/pool')

const SITE = 'https://floridarevenue.com'
const NAL_DIR = '/property/dataportal/Documents/PTO Data Portal/Tax Roll Data Files/NAL'
const API = `${SITE}/property/dataportal/_api/web/GetFolderByServerRelativeUrl`
const JSON_HEADERS = { Accept: 'application/json;odata=nometadata' }
const BATCH = 1000

/* ── Find the newest NAL file for a county (final roll preferred over preliminary) ── */
async function listFolder(kind, folderPath) {
  const url = `${API}('${encodeURI(folderPath.replace(/'/g, "''"))}')/${kind}`
  const res = await fetch(url, { headers: JSON_HEADERS, timeout: 30000 })
  if (!res.ok) throw new Error(`FDOR listing failed (${res.status})`)
  const json = await res.json()
  return json.value || []
}

function rankFolder(name) {
  const m = String(name).match(/^(\d{4})([FP])$/i)
  if (!m) return -1
  return Number(m[1]) * 10 + (m[2].toUpperCase() === 'F' ? 2 : 1)
}

async function findLatestFile(county) {
  const folders = (await listFolder('Folders', NAL_DIR))
    .map(f => f.Name)
    .filter(n => rankFolder(n) > 0)
    .sort((a, b) => rankFolder(b) - rankFolder(a))

  for (const folder of folders) {
    const files = await listFolder('Files', `${NAL_DIR}/${folder}`)
    const hit = files.find(f => county.fdorFile.test(f.Name) && /\.zip$/i.test(f.Name))
    if (hit) {
      return {
        name: hit.Name,
        folder,
        rollType: /F$/i.test(folder) ? 'final' : 'preliminary',
        modified: hit.TimeLastModified,
        size: Number(hit.Length) || null,
        url: SITE + encodeURI(hit.ServerRelativeUrl),
      }
    }
  }
  return null
}

/* ── Field clean-up ── */
const txt = (v) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s || null
}
const int = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}
const pos = (v) => { const n = int(v); return n && n > 0 ? n : null }
const zip5 = (v) => { const s = String(v ?? '').replace(/\D/g, ''); return s.length >= 5 ? s.slice(0, 5) : null }
const saleDate = (yr, mo) => {
  const y = int(yr), m = int(mo)
  if (!y || y < 1900 || y > 2100) return null
  const mm = m && m >= 1 && m <= 12 ? m : 1
  return `${y}-${String(mm).padStart(2, '0')}-01`
}
const addrKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/* Absentee indicator: owner's mailing address is not the property address */
function absenteeFlag(r) {
  const own = addrKey(r.OWN_ADDR1)
  const phy = addrKey(r.PHY_ADDR1)
  if (!own || !phy) return null
  const ownTokens = own.split(' ').slice(0, 2).join(' ')
  const phyTokens = phy.split(' ').slice(0, 2).join(' ')
  const sameStreet = own.startsWith(phy) || phy.startsWith(own) || ownTokens === phyTokens
  const ownZip = zip5(r.OWN_ZIPCD), phyZip = zip5(r.PHY_ZIPCD)
  if (sameStreet && (!ownZip || !phyZip || ownZip === phyZip)) return false
  return true
}

/* Subdivision / condo name from the short legal description, e.g.
   "SUNFLOWER MARGATE 82-38 B LOT 245" → "SUNFLOWER MARGATE", "BAHAMA VILLAGE CONDO UNIT G1" → "BAHAMA VILLAGE CONDO".
   Miami-Dade gets its subdivision from the county appraiser instead. */
const LEGAL_STOP = /\s+(?:\d+-\d+\s*B\b|PB\s*\d|PLAT\b|LOTS?\b|LT\b|BLK\b|BLOCK\b|UNIT\b|UNITS\b|APT\b|BLDG\b|TR\b|TRACT\b|PARCEL\b|PAR\b|PT\b|PART\b|PER\b|ADD\b\s*\d|SEC\b\s*\d|PH\b\s*\d|\d+\s*-\s*\d+|N\b\s*\d|S\b\s*\d|E\b\s*\d|W\b\s*\d)/
function subdivisionFromLegal(legal) {
  const t = String(legal || '').toUpperCase().replace(/\s+/g, ' ').trim()
  if (!t || /^[\d\s-]/.test(t)) return null
  const name = t.split(LEGAL_STOP)[0].replace(/[,;.\s]+$/, '').trim()
  if (name.length < 4 || name.length > 60 || !/[A-Z]{3}/.test(name)) return null
  return name
}

function mapRow(r, countyNo, rollType, importId) {
  const parcelId = txt(r.PARCEL_ID)
  if (!parcelId) return null
  return [
    countyNo,
    parcelId,
    txt(r.PHY_ADDR1)?.toUpperCase() || null,
    txt(r.PHY_CITY),
    zip5(r.PHY_ZIPCD),
    txt(r.OWN_NAME),
    txt(r.OWN_ADDR1),
    txt(r.OWN_CITY),
    txt(r.OWN_STATE),
    zip5(r.OWN_ZIPCD),
    int(r.DOR_UC),
    int(r.JV),
    pos(r.LND_SQFOOT),
    pos(r.TOT_LVG_AREA),
    pos(r.ACT_YR_BLT),
    pos(r.EFF_YR_BLT),
    pos(r.NO_RES_UNTS),
    pos(r.NO_BULDNG),
    (int(r.EXMPT_01) || 0) > 0,
    absenteeFlag(r),
    pos(r.SALE_PRC1),
    saleDate(r.SALE_YR1, r.SALE_MO1),
    txt(r.QUAL_CD1),
    pos(r.SALE_PRC2),
    saleDate(r.SALE_YR2, r.SALE_MO2),
    int(r.ASMNT_YR),
    rollType,
    importId,
    countyNo === 23 ? null : subdivisionFromLegal(r.S_LEGAL),
  ]
}

const COLS = [
  ['county_no', 'smallint'], ['parcel_id', 'text'], ['phy_addr1', 'text'], ['phy_city', 'text'], ['phy_zip', 'text'],
  ['own_name', 'text'], ['own_addr1', 'text'], ['own_city', 'text'], ['own_state', 'text'], ['own_zip', 'text'],
  ['dor_uc', 'smallint'], ['just_value', 'bigint'], ['land_sqft', 'bigint'], ['living_sqft', 'bigint'],
  ['year_built', 'smallint'], ['eff_year_built', 'smallint'], ['res_units', 'integer'], ['buildings', 'integer'],
  ['homestead', 'boolean'], ['absentee', 'boolean'], ['sale_price1', 'bigint'], ['sale_date1', 'date'],
  ['sale_qual1', 'text'], ['sale_price2', 'bigint'], ['sale_date2', 'date'], ['roll_year', 'smallint'],
  ['roll_type', 'text'], ['import_id', 'integer'], ['subdivision', 'text'],
]

const UPSERT_SQL = `
  INSERT INTO parcels (${COLS.map(c => c[0]).join(', ')})
  SELECT * FROM unnest(${COLS.map((c, i) => `$${i + 1}::${c[1]}[]`).join(', ')})
  ON CONFLICT (county_no, parcel_id) DO UPDATE SET
  ${COLS.slice(2).map(c => c[0] === 'subdivision' ? 'subdivision = COALESCE(EXCLUDED.subdivision, parcels.subdivision)' : `${c[0]} = EXCLUDED.${c[0]}`).join(', ')}, updated_at = NOW()`

async function writeBatch(client, rows) {
  /* The same parcel can appear twice in a file — keep the last one */
  const seen = new Map()
  for (const r of rows) seen.set(r[1], r)
  const uniq = [...seen.values()]
  const cols = COLS.map((_, i) => uniq.map(r => r[i]))
  await client.query(UPSERT_SQL, cols)
  return uniq.length
}

async function download(url, dest) {
  const res = await fetch(url, { timeout: 0 })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest)
    res.body.pipe(out)
    res.body.on('error', reject)
    out.on('finish', resolve)
    out.on('error', reject)
  })
}

/* ── Load one county's roll into the parcels table ── */
async function importCounty(county, file) {
  const client = await pool.connect()
  const tmp = path.join(os.tmpdir(), `nal-${county.no}-${Date.now()}.zip`)
  let importId = null
  try {
    const ins = await client.query(
      `INSERT INTO data_imports (county_no, source, file_name, file_modified) VALUES ($1,'fdor-nal',$2,$3) RETURNING id`,
      [county.no, file.name, file.modified]
    )
    importId = ins.rows[0].id
    console.log(`[data] ${county.name}: downloading ${file.name}`)
    await download(file.url, tmp)

    const zip = await unzipper.Open.file(tmp)
    const entry = zip.files.find(f => /\.csv$/i.test(f.path) || /\.txt$/i.test(f.path))
    if (!entry) throw new Error('No CSV file inside the ZIP')

    const parser = entry.stream().pipe(parse({
      columns: (header) => header.map(h => String(h).trim().toUpperCase()),
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      bom: true,
    }))

    let batch = [], loaded = 0, checked = false
    for await (const record of parser) {
      if (!checked) {
        if (!('PARCEL_ID' in record) || !('PHY_ADDR1' in record)) throw new Error('Unexpected file layout (missing PARCEL_ID / PHY_ADDR1)')
        const fileCounty = int(record.CO_NO)
        if (fileCounty && fileCounty !== county.no) throw new Error(`File is for county ${fileCounty}, expected ${county.no}`)
        checked = true
      }
      const row = mapRow(record, county.no, file.rollType, importId)
      if (row) batch.push(row)
      if (batch.length >= BATCH) {
        loaded += await writeBatch(client, batch)
        batch = []
        if (loaded % 50000 < BATCH) {
          console.log(`[data] ${county.name}: ${loaded.toLocaleString()} properties loaded`)
          await client.query('UPDATE data_imports SET rows_loaded=$1 WHERE id=$2', [loaded, importId])
        }
      }
    }
    if (batch.length) loaded += await writeBatch(client, batch)
    if (loaded < 1000) throw new Error(`Only ${loaded} rows found — file looks incomplete`)

    /* Remove parcels that no longer exist on the new roll */
    const del = await client.query('DELETE FROM parcels WHERE county_no=$1 AND import_id IS DISTINCT FROM $2', [county.no, importId])
    await client.query(
      `UPDATE data_imports SET status='done', rows_loaded=$1, finished_at=NOW() WHERE id=$2`,
      [loaded, importId]
    )
    console.log(`[data] ${county.name}: done — ${loaded.toLocaleString()} properties (${del.rowCount} removed)`)
    return loaded
  } catch (e) {
    console.error(`[data] ${county.name}: import failed —`, e.message)
    if (importId) {
      await client.query(`UPDATE data_imports SET status='failed', error=$1, finished_at=NOW() WHERE id=$2`, [e.message.slice(0, 500), importId]).catch(() => {})
    }
    throw e
  } finally {
    client.release()
    fs.promises.unlink(tmp).catch(() => {})
  }
}

module.exports = { subdivisionFromLegal, findLatestFile, importCounty, mapRow, absenteeFlag }
