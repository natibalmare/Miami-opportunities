// backend/adapters/browardRecords.js
// Broward County Official Records — deeds, mortgages, liens, lis pendens, judgments, probate filings.
// The Broward Clerk publishes daily index files and yearly exports on its public SFTP server
// (login published by the Clerk for public use: crpublic / crpublic). Files are pipe-delimited:
//   doc  : instrument | yyyymmdd | mm/dd/yyyy | time | doc type | consideration | book | page | … | pages(13) | … | case #(18)
//   nme  : instrument | name | D (from / grantor) or R (to / grantee) | sequence
//   lgl  : instrument | legal description | parcel id
//   lnk  : instrument | | | O | doc type | linked instrument | | | O | linked type | …

const readline = require('readline')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { query, pool } = require('../db/pool')

const HOST = { host: 'BCFTP.Broward.org', port: 22, username: 'crpublic', password: 'crpublic', readyTimeout: 30000 }
const DAILY_DIR = '/Official_Records_Download'
const YEARLY_DIR = '/OR_Yearly_Exports'
/* Yearly exports to load (recent history). Daily files keep everything current after that. */
const YEARS = String(process.env.BROWARD_OR_YEARS || '2024,2025').split(',').map(s => s.trim()).filter(Boolean)
const BATCH = 5000

const DOC_TYPES = {
  D: 'Deed', DED: 'Deed', WD: 'Warranty deed', QCD: 'Quitclaim deed', QC: 'Quitclaim deed', TD: 'Tax deed', CT: 'Certificate of title',
  M: 'Mortgage', MOD: 'Mortgage modification', ASG: 'Assignment', AM: 'Assignment of mortgage', SAT: 'Satisfaction', SM: 'Satisfaction of mortgage',
  REL: 'Release', RST: 'Release / satisfaction', PR: 'Partial release', LP: 'Lis pendens', RLP: 'Release of lis pendens',
  J: 'Judgment', FJ: 'Final judgment', CFJ: 'Certified final judgment', LN: 'Lien', L: 'Lien', CL: 'Claim of lien', TL: 'Tax lien',
  FTL: 'Federal tax lien', CEL: 'Code enforcement lien', NOC: 'Notice of commencement', PRO: 'Probate', DC: 'Death certificate',
  AFF: 'Affidavit', AGR: 'Agreement', EAS: 'Easement', PLAT: 'Plat', POA: 'Power of attorney', DEC: 'Declaration', ORD: 'Court order', O: 'Court order',
}
const docLabel = (t) => DOC_TYPES[String(t || '').toUpperCase()] || t

async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS or_docs (
    county_no SMALLINT NOT NULL, instr BIGINT NOT NULL, rec_date DATE, doc_type TEXT, consideration NUMERIC,
    book TEXT, page TEXT, pages INTEGER, case_no TEXT, PRIMARY KEY (county_no, instr))`)
  await query(`CREATE TABLE IF NOT EXISTS or_names (
    county_no SMALLINT NOT NULL, instr BIGINT NOT NULL, name TEXT NOT NULL, side CHAR(1), seq SMALLINT,
    PRIMARY KEY (county_no, instr, side, seq))`)
  await query(`CREATE TABLE IF NOT EXISTS or_parcels (
    county_no SMALLINT NOT NULL, instr BIGINT NOT NULL, parcel_id TEXT NOT NULL, legal TEXT,
    PRIMARY KEY (county_no, instr, parcel_id))`)
  await query(`CREATE TABLE IF NOT EXISTS or_links (
    county_no SMALLINT NOT NULL, instr BIGINT NOT NULL, linked_instr BIGINT NOT NULL, linked_type TEXT,
    PRIMARY KEY (county_no, instr, linked_instr))`)
  await query(`CREATE INDEX IF NOT EXISTS idx_or_parcels_parcel ON or_parcels (county_no, parcel_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_or_names_name ON or_names (county_no, name text_pattern_ops)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_or_links_linked ON or_links (county_no, linked_instr)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_or_docs_type ON or_docs (county_no, doc_type, rec_date)`)
}

const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null }
const ymd = (v) => /^\d{8}$/.test(v || '') ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null
const txt = (v) => { const t = String(v ?? '').trim(); return t || null }

const KINDS = {
  doc: {
    sql: `INSERT INTO or_docs (county_no, instr, rec_date, doc_type, consideration, book, page, pages, case_no)
          SELECT 16, i, d::date, t, c::numeric, b, p, pg, cs FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::text[])
            AS x(i, d, t, c, b, p, pg, cs)
          ON CONFLICT (county_no, instr) DO UPDATE SET rec_date=EXCLUDED.rec_date, doc_type=EXCLUDED.doc_type, consideration=EXCLUDED.consideration,
            book=EXCLUDED.book, page=EXCLUDED.page, pages=EXCLUDED.pages, case_no=EXCLUDED.case_no`,
    parse: (f) => { const i = int(f[0]); if (!i || i < 0) return null
      const c = parseFloat(f[5]); return [i, ymd(f[1]), txt(f[4]), Number.isFinite(c) ? String(c) : null, txt(f[6]), txt(f[7]), int(f[13]), txt(f[18])] },
    cols: 8, key: (r) => r[0],
  },
  nme: {
    sql: `INSERT INTO or_names (county_no, instr, name, side, seq)
          SELECT 16, i, n, s, q FROM unnest($1::bigint[], $2::text[], $3::text[], $4::smallint[]) AS x(i, n, s, q)
          ON CONFLICT DO NOTHING`,
    parse: (f) => { const i = int(f[0]); const n = txt(f[1]); if (!i || i < 0 || !n) return null
      return [i, n.toUpperCase().slice(0, 200), (txt(f[2]) || '?').slice(0, 1), int(f[3]) || 1] },
    cols: 4, key: (r) => `${r[0]}|${r[2]}|${r[3]}`,
  },
  lgl: {
    sql: `INSERT INTO or_parcels (county_no, instr, parcel_id, legal)
          SELECT 16, i, p, l FROM unnest($1::bigint[], $2::text[], $3::text[]) AS x(i, p, l)
          ON CONFLICT DO NOTHING`,
    parse: (f) => { const i = int(f[0]); const p = txt(f[2]); if (!i || i < 0 || !p || p.length < 8) return null
      return [i, p.toUpperCase().replace(/[^0-9A-Z]/g, ''), (txt(f[1]) || '').slice(0, 300)] },
    cols: 3, key: (r) => `${r[0]}|${r[1]}`,
  },
  lnk: {
    sql: `INSERT INTO or_links (county_no, instr, linked_instr, linked_type)
          SELECT 16, i, l, t FROM unnest($1::bigint[], $2::bigint[], $3::text[]) AS x(i, l, t)
          ON CONFLICT DO NOTHING`,
    parse: (f) => { const i = int(f[0]); const l = int(f[5]); if (!i || i < 0 || !l || l < 0) return null
      return [i, l, txt(f[9])] },
    cols: 3, key: (r) => `${r[0]}|${r[1]}`,
  },
}

const kindOf = (name) => {
  const m = name.toLowerCase().match(/(doc|nme|lgl|lnk)-(ver|rec)\.txt$/)
  return m && !/rng/.test(name.toLowerCase()) ? m[1] : null
}

async function writeBatch(kind, rows) {
  const k = KINDS[kind]
  const uniq = [...new Map(rows.map(r => [k.key(r), r])).values()]
  const cols = Array.from({ length: k.cols }, (_, c) => uniq.map(r => r[c]))
  await query(k.sql, cols)
  return uniq.length
}

async function importFile(sftp, dir, file) {
  const kind = kindOf(file.name)
  if (!kind) return 0
  const ins = await query(`INSERT INTO data_imports (county_no, source, file_name, file_modified) VALUES (16,'broward-or',$1,$2) RETURNING id`,
    [file.name, new Date(file.modifyTime)])
  const importId = ins.rows[0].id
  let loaded = 0
  try {
    /* Download first (parallel transfer), then read from local disk — much faster than streaming over SFTP */
    const local = path.join(os.tmpdir(), `bcor-${process.pid}-${file.name}`)
    const t0 = Date.now()
    await sftp.fastGet(`${dir}/${file.name}`, local, { concurrency: 32, chunkSize: 65536 })
    if (file.size > 5e6) console.log(`[or] Broward ${file.name}: downloaded ${Math.round(file.size / 1e6)} MB in ${Math.round((Date.now() - t0) / 1000)}s`)
    const stream = fs.createReadStream(local, { encoding: 'latin1' })
    stream.on('close', () => fs.promises.unlink(local).catch(() => {}))
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
    let batch = []
    for await (const line of rl) {
      if (!line) continue
      const row = KINDS[kind].parse(line.split('|'))
      if (!row) continue
      batch.push(row)
      if (batch.length >= BATCH) { loaded += await writeBatch(kind, batch); batch = [] }
    }
    if (batch.length) loaded += await writeBatch(kind, batch)
    await query(`UPDATE data_imports SET status='done', rows_loaded=$1, finished_at=NOW() WHERE id=$2`, [loaded, importId])
    console.log(`[or] Broward ${file.name}: ${loaded.toLocaleString()} rows`)
    return loaded
  } catch (e) {
    await query(`UPDATE data_imports SET status='failed', error=$1, finished_at=NOW() WHERE id=$2`, [e.message.slice(0, 500), importId]).catch(() => {})
    throw e
  }
}

/* Load the yearly exports once, then every daily file not loaded yet. tooBig() is checked between files. */
async function syncBroward(tooBig) {
  await ensureTables()
  const done = new Set((await query(`SELECT file_name FROM data_imports WHERE county_no=16 AND source='broward-or' AND status='done'`)).rows.map(r => r.file_name))
  const SftpClient = require('ssh2-sftp-client')
  let sftp
  for (let attempt = 1; ; attempt++) {
    sftp = new SftpClient()
    try { await sftp.connect({ ...HOST, readyTimeout: 60000, retries: 2, retry_minTimeout: 5000 }); break } catch (e) {
      await sftp.end().catch(() => {})
      if (attempt >= 3) throw e
      console.log(`[or] Broward server busy (${e.message}) — retrying in ${attempt * 30}s`)
      await new Promise(r => setTimeout(r, attempt * 30000))
    }
  }
  try {
    const yearly = (await sftp.list(YEARLY_DIR)).filter(f => f.type === '-' && kindOf(f.name) && YEARS.some(y => f.name.startsWith(`CY${y}`)))
    const daily = (await sftp.list(DAILY_DIR)).filter(f => f.type === '-' && kindOf(f.name)).sort((a, b) => a.modifyTime - b.modifyTime)
    /* Order inside each group: documents first, then names, parcels and links */
    const order = { doc: 0, nme: 1, lgl: 2, lnk: 3 }
    const todo = [
      ...yearly.sort((a, b) => a.name.localeCompare(b.name) || order[kindOf(a.name)] - order[kindOf(b.name)]).map(f => [YEARLY_DIR, f]),
      ...daily.map(f => [DAILY_DIR, f]),
    ].filter(([, f]) => !done.has(f.name))
    if (!todo.length) { console.log('[or] Broward official records: up to date'); return }
    console.log(`[or] Broward official records: ${todo.length} files to load`)
    for (const [dir, f] of todo) {
      if (tooBig && await tooBig()) { console.log('[or] stopping — database size limit'); break }
      try { await importFile(sftp, dir, f) } catch (e) { console.error(`[or] Broward ${f.name}: failed — ${e.message}`) }
    }
    const types = await query(`SELECT doc_type, COUNT(*)::int AS n FROM or_docs WHERE county_no=16 GROUP BY 1 ORDER BY 2 DESC LIMIT 40`)
    console.log('[or] Broward document types:', types.rows.map(t => `${t.doc_type}=${t.n}`).join(', '))
  } finally {
    await sftp.end().catch(() => {})
  }
}

/* Recorded documents for one Broward parcel, newest first, with who signed / received and linked releases */
async function documentsFor(parcelId) {
  const pid = String(parcelId || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  const r = await query(
    `SELECT d.instr, to_char(d.rec_date, 'YYYY-MM-DD') AS rec_date, d.doc_type, d.consideration, d.book, d.page, d.pages, d.case_no,
            (SELECT string_agg(n.name, '; ' ORDER BY n.seq) FROM or_names n WHERE n.county_no = 16 AND n.instr = d.instr AND n.side = 'D') AS from_names,
            (SELECT string_agg(n.name, '; ' ORDER BY n.seq) FROM or_names n WHERE n.county_no = 16 AND n.instr = d.instr AND n.side = 'R') AS to_names,
            (SELECT json_agg(json_build_object('instr', l.instr, 'type', d2.doc_type, 'date', to_char(d2.rec_date, 'YYYY-MM-DD')))
               FROM or_links l LEFT JOIN or_docs d2 ON d2.county_no = 16 AND d2.instr = l.instr
              WHERE l.county_no = 16 AND l.linked_instr = d.instr) AS released_by
       FROM or_parcels op JOIN or_docs d ON d.county_no = op.county_no AND d.instr = op.instr
      WHERE op.county_no = 16 AND op.parcel_id = $1
      ORDER BY d.rec_date DESC NULLS LAST LIMIT 200`, [pid])
  return r.rows.map(x => ({
    instrument: String(x.instr), date: x.rec_date, type: x.doc_type, typeLabel: docLabel(x.doc_type),
    amount: x.consideration ? Number(x.consideration) : null, book: x.book, page: x.page, pages: x.pages, caseNumber: x.case_no,
    from: x.from_names, to: x.to_names, releasedBy: x.released_by || [],
  }))
}

module.exports = { syncBroward, documentsFor, ensureTables, docLabel, DOC_TYPES }
