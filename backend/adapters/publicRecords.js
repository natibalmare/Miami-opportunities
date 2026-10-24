// backend/adapters/publicRecords.js
// Public county & city records published as open map services (no login, no scraping):
//  • Miami-Dade County — code compliance cases, code liens, building violations / unsafe structures
//  • City of Miami — building permits and 40/50-year building recertification
//  • City of Fort Lauderdale (Broward) — building permits and code cases
// Each property's records are looked up live (cached 12 h); open cases and liens are also
// synced daily into public_cases so lead lists, the map and the Opportunity Score can use them.

const fetch = require('node-fetch')
const { query, pool } = require('../db/pool')

const MD_AGOL = 'https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/ArcGIS/rest/services'
const date = (v) => {
  if (v === null || v === undefined || v === '') return null
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  return isNaN(d) ? null : d.toISOString().slice(0, 10)
}
const txt = (v) => (v === null || v === undefined) ? null : String(v).trim() || null
const isOpenStatus = (s) => !/clos|complet|final|void|cancel|expired|withdrawn|compl(ied|iance)|resolved|dismiss|paid|satisf|released|inactive|issued co/i.test(String(s || ''))

/* kind: code | code_lien | building_violation | permit | recert */
const SOURCES = [
  {
    id: 'md_code_open', county: 23, name: 'Miami-Dade Code Compliance — open cases', kind: 'code', sync: true,
    url: `${MD_AGOL}/CodeComplianceViolation_Open_View/FeatureServer/0`, idField: 'FOLIO',
    map: (a) => ({ caseNum: txt(a.CASE_NUM), type: txt(a.PROBLEM_DESC) || txt(a.PROBLEM), status: txt(a.STAT_DESC) || txt(a.CASE_STATUS), open: true,
      opened: date(a.CASE_DATE), lastActivity: date(a.LAST_ACTV), address: txt(a.ADDRESS),
      lien: a.LN_RECBOOK ? { book: txt(a.LN_RECBOOK), page: txt(a.LN_RECPAGE), date: date(a.LN_RECDATE) } : null }),
  },
  {
    id: 'md_code_lien', county: 23, name: 'Miami-Dade Code Compliance — liens', kind: 'code_lien', sync: true,
    url: `${MD_AGOL}/CodeComplianceViolation_Lien_View/FeatureServer/0`, idField: 'FOLIO',
    map: (a) => ({ caseNum: txt(a.CASE_NUM), type: txt(a.PROBLEM_DESC) || txt(a.PROBLEM), status: txt(a.STAT_DESC) || 'Lien recorded', open: true,
      opened: date(a.CASE_DATE), lastActivity: date(a.LAST_ACTV), address: txt(a.ADDRESS),
      lien: { book: txt(a.LN_RECBOOK), page: txt(a.LN_RECPAGE), date: date(a.LN_RECDATE), referral: txt(a.LN_RFRLTDE) } }),
  },
  {
    id: 'md_code_closed', county: 23, name: 'Miami-Dade Code Compliance — closed (5 years)', kind: 'code', sync: false,
    url: `${MD_AGOL}/CodeComplianceViolation_ClosedPast5Years_View/FeatureServer/0`, idField: 'FOLIO',
    map: (a) => ({ caseNum: txt(a.CASE_NUM), type: txt(a.PROBLEM_DESC) || txt(a.PROBLEM), status: txt(a.STAT_DESC) || 'Closed', open: false,
      opened: date(a.CASE_DATE), lastActivity: date(a.LAST_ACTV), address: txt(a.ADDRESS) }),
  },
  {
    id: 'md_bldg_open', county: 23, name: 'Miami-Dade Building Violations — open', kind: 'building_violation', sync: true,
    url: `${MD_AGOL}/Open_Building_Violations/FeatureServer/0`, idField: 'FOLIO',
    map: (a) => ({ caseNum: txt(a.CASE_NUM), type: txt(a.VIOL_NAME) || txt(a.CASE_TYPE), status: 'Open', open: true,
      opened: date(a.OPEN_DATE), closed: date(a.CLOSED_DATE), address: txt(a.PROP_ADDR), permit: txt(a.PERMIT_NUM),
      unsafe: /unsafe/i.test(`${a.CASE_TYPE} ${a.VIOL_NAME}`) }),
  },
  {
    id: 'md_bldg_closed', county: 23, name: 'Miami-Dade Building Violations — closed (5 years)', kind: 'building_violation', sync: false,
    url: `${MD_AGOL}/Closed_Building_Violations_(Past_5_years)/FeatureServer/0`, idField: 'FOLIO',
    map: (a) => ({ caseNum: txt(a.CASE_NUM), type: txt(a.VIOL_NAME) || txt(a.CASE_TYPE), status: 'Closed', open: false,
      opened: date(a.OPEN_DATE), closed: date(a.CLOSED_DATE), address: txt(a.PROP_ADDR), permit: txt(a.PERMIT_NUM),
      unsafe: /unsafe/i.test(`${a.CASE_TYPE} ${a.VIOL_NAME}`) }),
  },
  {
    id: 'mia_permits', county: 23, name: 'City of Miami — building permits', kind: 'permit', sync: false,
    url: 'https://gis.miami.gov/gis/rest/services/Maps/iBuildPermits/MapServer/0', idField: 'FOLIO',
    map: (a) => ({ caseNum: txt(a.PermitNumber) || txt(a.ApplicationNumber), type: txt(a.PermitType) || txt(a.MasterPermitType) || txt(a.ApplicationType),
      status: txt(a.PermitStatus) || txt(a.MasterPermitStatus), open: isOpenStatus(a.PermitStatus || a.MasterPermitStatus),
      opened: date(a.PermitIssuedDate) || date(a.ApplicationStatusDate), description: txt(a.ScopeOfWork), address: txt(a.FULLADDR) }),
  },
  {
    id: 'mia_recert', county: 23, name: 'City of Miami — 40/50-year building recertification', kind: 'recert', sync: true,
    url: 'https://gis.miami.gov/gis/rest/services/SmartCities/Recertification_40Years/MapServer/0', idField: 'FolioNumber',
    map: (a) => ({ caseNum: txt(a.PlanNumber) || (a.RecertificateYear ? `Recert ${a.RecertificateYear}` : null), type: `Building recertification ${a.RecertificateYear || ''}`.trim(),
      status: txt(a.CertificationStatus) || txt(a.RecertificationProcessStatus), open: !/complet|certified|approved|compliant|accepted/i.test(String(a.CertificationStatus || '')),
      opened: date(a.SubmittedDate), lastActivity: date(a.PlanStatusDate) || date(a.UpdatedDate), description: txt(a.PlanStatusReason), address: txt(a.Address) }),
  },
  {
    id: 'ftl_permits', county: 16, name: 'Fort Lauderdale — building permits', kind: 'permit', sync: false,
    url: 'https://gis.fortlauderdale.gov/arcgis/rest/services/BuildingPermitTracker/BuildingPermitTracker/MapServer/0', idField: 'PARCELID',
    map: (a) => ({ caseNum: txt(a.PERMITID), type: txt(a.PERMITTYPE), status: txt(a.PERMITSTAT), open: isOpenStatus(a.PERMITSTAT),
      opened: date(a.APPROVEDT) || date(a.SUBMITDT), description: txt(a.PERMITDESC), address: txt(a.FULLADDR), cost: a.ESTCOST || null, contractor: txt(a.CONTRACTOR) }),
  },
  {
    id: 'ftl_code', county: 16, name: 'Fort Lauderdale — code cases', kind: 'code', sync: true,
    url: 'https://gis.fortlauderdale.gov/arcgis/rest/services/CodeCaseTracker/CodeCase/MapServer/0', idField: 'PARCELID',
    map: (a) => ({ caseNum: txt(a.CASENUM), type: txt(a.CASETYPE), status: a.CASESTATUS === 'O' ? 'Open' : a.CASESTATUS === 'C' ? 'Closed' : txt(a.CASESTATUS), open: a.CASESTATUS === 'O',
      opened: date(a.INITDATE), address: txt(a.SITEADDRESS) }),
  },
]

async function arcgis(url, params) {
  const qs = new URLSearchParams({ f: 'json', returnGeometry: 'false', outFields: '*', ...params })
  const r = await fetch(`${url}/query?${qs}`, { timeout: 25000 })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json()
  if (j.error) throw new Error(j.error.message || 'Query error')
  return j
}

/* Parcel IDs: the tax roll uses plain digits. Some services store dashes — try both. */
const idVariants = (countyNo, id) => {
  const d = String(id || '').replace(/\D/g, '')
  const v = new Set([d])
  if (countyNo === 23 && d.length === 13) v.add(`${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 9)}-${d.slice(9)}`)
  return [...v].filter(Boolean)
}

/* ── Per-property lookup (cached) ─────────────────────────────────────────── */
const cache = new Map()
const TTL = 12 * 60 * 60 * 1000

async function recordsFor(countyNo, parcelId) {
  const key = `${countyNo}|${parcelId}`
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  const list = SOURCES.filter(s => s.county === countyNo)
  const ids = idVariants(countyNo, parcelId)
  const out = { records: [], sources: [], checkedAt: new Date().toISOString() }
  await Promise.all(list.map(async (s) => {
    try {
      const where = ids.map(i => `${s.idField}='${i.replace(/'/g, "''")}'`).join(' OR ')
      const j = await arcgis(s.url, { where, resultRecordCount: '200' })
      const rows = (j.features || []).map(f => ({ source: s.id, sourceName: s.name, kind: s.kind, ...s.map(f.attributes || {}) }))
      out.records.push(...rows)
      out.sources.push({ id: s.id, name: s.name, ok: true, count: rows.length })
    } catch (e) {
      out.sources.push({ id: s.id, name: s.name, ok: false, error: e.message })
    }
  }))
  /* De-duplicate cases that appear in two views (e.g. open case + lien view) */
  const seen = new Set()
  out.records = out.records.filter(r => {
    const k = `${r.kind === 'code_lien' ? 'code' : r.kind}|${r.caseNum}`
    if (r.kind === 'code_lien') { seen.add(k); return true }
    if (r.caseNum && seen.has(k)) return false
    seen.add(k); return true
  }).sort((a, b) => String(b.opened || '').localeCompare(String(a.opened || '')))
  out.summary = summarize(out.records)
  if (cache.size > 20000) cache.clear()
  /* Cache only complete answers so a temporary outage is retried next time */
  if (out.sources.every(x => x.ok)) cache.set(key, { value: out, expires: Date.now() + TTL })
  return out
}

function summarize(records) {
  const open = (k) => records.filter(r => r.kind === k && r.open)
  const flags = []
  const code = open('code'), liens = records.filter(r => r.kind === 'code_lien' || (r.kind === 'code' && r.lien)), bv = open('building_violation')
  const unsafe = bv.filter(r => r.unsafe), permitsOpen = open('permit'), recert = open('recert')
  if (unsafe.length) flags.push('Unsafe structure case on record')
  if (bv.length) flags.push(`${bv.length} open building violation${bv.length > 1 ? 's' : ''}`)
  if (code.length) flags.push(`${code.length} open code case${code.length > 1 ? 's' : ''}`)
  if (liens.length) flags.push(`${liens.length} code lien${liens.length > 1 ? 's' : ''} recorded`)
  if (recert.length) flags.push('Building recertification not completed')
  if (permitsOpen.length) flags.push(`${permitsOpen.length} open or unfinished permit${permitsOpen.length > 1 ? 's' : ''}`)
  const expired = records.filter(r => r.kind === 'permit' && /expired/i.test(String(r.status || '')))
  if (expired.length) flags.push(`${expired.length} expired permit${expired.length > 1 ? 's' : ''} — may need to be reopened and closed`)
  return {
    openCode: code.length, codeLiens: liens.length, openBuildingViolations: bv.length, unsafe: unsafe.length > 0,
    openPermits: permitsOpen.length, expiredPermits: expired.length, totalPermits: records.filter(r => r.kind === 'permit').length, recertPending: recert.length > 0,
    financingFlags: flags,
  }
}

/* ── Daily sync of open cases and liens ───────────────────────────────────── */
async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS public_cases (
    source TEXT NOT NULL, case_num TEXT NOT NULL, county_no SMALLINT NOT NULL, parcel_id TEXT NOT NULL,
    kind TEXT NOT NULL, case_type TEXT, status TEXT, opened DATE, lien_date DATE, unsafe BOOLEAN DEFAULT false,
    sync_id INTEGER, updated_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (source, case_num))`)
  await query(`CREATE INDEX IF NOT EXISTS idx_public_cases_parcel ON public_cases (county_no, parcel_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_public_cases_kind ON public_cases (kind, county_no)`)
}

async function syncSource(s, syncId) {
  let offset = 0, total = 0
  const pageSize = 1000
  for (let pages = 0; pages < 400; pages++) {
    const j = await arcgis(s.url, { where: s.syncWhere || '1=1', resultOffset: String(offset), resultRecordCount: String(pageSize), orderByFields: 'OBJECTID' })
    const feats = j.features || []
    const rows = []
    for (const f of feats) {
      const a = f.attributes || {}
      const pid = String(a[s.idField] || '').replace(/\D/g, '')
      const m = s.map(a)
      if (!pid || !m.caseNum || m.open === false) continue
      rows.push([m.caseNum, pid, m.type, m.status, m.opened, m.lien?.date || null, !!m.unsafe])
    }
    if (rows.length) {
      const u = [...new Map(rows.map(r => [r[0], r])).values()]
      await query(
        `INSERT INTO public_cases (source, case_num, county_no, parcel_id, kind, case_type, status, opened, lien_date, unsafe, sync_id, updated_at)
         SELECT $1, c, $2, p, $3, t, st, o::date, l::date, us, $4, NOW()
           FROM unnest($5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::bool[]) AS x(c, p, t, st, o, l, us)
         ON CONFLICT (source, case_num) DO UPDATE SET parcel_id=EXCLUDED.parcel_id, case_type=EXCLUDED.case_type, status=EXCLUDED.status,
           opened=EXCLUDED.opened, lien_date=EXCLUDED.lien_date, unsafe=EXCLUDED.unsafe, sync_id=EXCLUDED.sync_id, updated_at=NOW()`,
        [s.id, s.county, s.kind, syncId, u.map(r => r[0]), u.map(r => r[1]), u.map(r => r[2]), u.map(r => r[3]), u.map(r => r[4]), u.map(r => r[5]), u.map(r => r[6])])
      total += u.length
    }
    if (feats.length < pageSize && !j.exceededTransferLimit) break
    offset += feats.length || pageSize
  }
  /* Cases no longer in the open list were closed — remove them */
  if (total > 0) await query('DELETE FROM public_cases WHERE source=$1 AND sync_id IS DISTINCT FROM $2', [s.id, syncId])
  return total
}

/* Log how many records each source holds — confirms every service answers */
async function verifySources() {
  for (const s of SOURCES) {
    try {
      const j = await arcgis(s.url, { where: '1=1', returnCountOnly: 'true' })
      console.log(`[records] check ${s.name}: ${Number(j.count || 0).toLocaleString()} records available`)
      if (s.statusField) {
        const st = await arcgis(s.url, { where: '1=1', groupByFieldsForStatistics: s.statusField,
          outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: s.statusField, outStatisticFieldName: 'n' }]) })
        const vals = (st.features || []).map(f => `${f.attributes[s.statusField]}=${f.attributes.n}`).slice(0, 40).join(', ')
        console.log(`[records] statuses ${s.name}: ${vals}`)
      }
    } catch (e) {
      console.error(`[records] check ${s.name}: unreachable — ${e.message}`)
    }
  }
}

async function syncAll() {
  await ensureTable()
  /* Drop stored cases from sources that are not synced (e.g. paused while being checked) */
  await query('DELETE FROM public_cases WHERE source <> ALL($1::text[])', [SOURCES.filter(x => x.sync).map(x => x.id)])
  await verifySources()
  const lock = await pool.connect()
  try {
    const got = await lock.query('SELECT pg_try_advisory_lock(778900) AS ok')
    if (!got.rows[0].ok) return
    const syncId = Math.floor(Date.now() / 1000)
    for (const s of SOURCES.filter(x => x.sync)) {
      try {
        const n = await syncSource(s, syncId)
        console.log(`[records] ${s.name}: ${n.toLocaleString()} open records`)
      } catch (e) {
        console.error(`[records] ${s.name}: failed — ${e.message}`)
      }
    }
    await lock.query('SELECT pg_advisory_unlock(778900)')
  } finally {
    lock.release()
  }
}

/* Distress flags for many parcels at once (used by the Opportunity Score) */
async function flagsFor(pairs) {
  const valid = pairs.filter(p => p.countyNo && p.parcelId)
  if (!valid.length) return new Map()
  try {
    const r = await query(
      `SELECT county_no, parcel_id,
              COUNT(*) FILTER (WHERE kind = 'code')::int AS code,
              COUNT(*) FILTER (WHERE kind = 'code_lien')::int AS liens,
              COUNT(*) FILTER (WHERE kind = 'building_violation')::int AS bv,
              BOOL_OR(unsafe) AS unsafe,
              COUNT(*) FILTER (WHERE kind = 'recert')::int AS recert
         FROM public_cases
        WHERE (county_no, parcel_id) IN (SELECT * FROM unnest($1::smallint[], $2::text[]))
        GROUP BY 1, 2`,
      [valid.map(p => p.countyNo), valid.map(p => String(p.parcelId).replace(/\D/g, ''))])
    return new Map(r.rows.map(x => [`${x.county_no}|${x.parcel_id}`, x]))
  } catch (e) {
    return new Map()
  }
}

module.exports = { SOURCES, recordsFor, syncAll, flagsFor, ensureTable, arcgis, verifySources }
