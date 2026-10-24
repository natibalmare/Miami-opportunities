// backend/jobs/probe.js
// One-time discovery checks. Runs only when DATA_PROBE=on and writes findings to the server log as "[probe] …".
// Current pass: Broward Official Records file layouts (public login published by the Clerk: crpublic / crpublic)
// and the database size.

const { query } = require('../db/pool')

const log = (...a) => console.log('[probe]', ...a)

async function head(sftp, path, bytes = 1800) {
  const chunks = []
  await new Promise((resolve, reject) => {
    const st = sftp.sftp.createReadStream(path, { start: 0, end: bytes })
    st.on('data', c => chunks.push(c)); st.on('end', resolve); st.on('error', reject)
  })
  return Buffer.concat(chunks).toString('latin1').split(/\r?\n/).slice(0, 5)
}

async function runProbe() {
  try {
    const r = await query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
      (SELECT pg_size_pretty(pg_total_relation_size('parcels'))) AS parcels,
      (SELECT pg_size_pretty(pg_total_relation_size('parcel_points'))) AS points`)
    log('database size', JSON.stringify(r.rows[0]))
  } catch (e) { log('db size error', e.message) }

  try {
    const SftpClient = require('ssh2-sftp-client')
    const sftp = new SftpClient()
    await sftp.connect({ host: 'BCFTP.Broward.org', port: 22, username: 'crpublic', password: 'crpublic', readyTimeout: 20000 })
    const daily = (await sftp.list('/Official_Records_Download')).filter(i => i.type === '-').sort((a, b) => b.modifyTime - a.modifyTime)
    log(`BCFTP daily files: ${daily.length}, oldest ${daily.length ? new Date(daily[daily.length - 1].modifyTime).toISOString().slice(0, 10) : '-'}`)
    for (const kind of ['doc-ver.txt', 'nme-ver.txt', 'lgl-ver.txt', 'lnk-ver.txt', 'doc-ver-rng.txt']) {
      const f = daily.find(i => i.name.endsWith(kind))
      if (!f) continue
      const lines = await head(sftp, `/Official_Records_Download/${f.name}`)
      lines.forEach(l => log(`BCFTP ${kind} | ${l.slice(0, 400)}`))
    }
    const yearly = (await sftp.list('/OR_Yearly_Exports')).filter(i => i.type === '-').sort((a, b) => a.name.localeCompare(b.name))
    log(`BCFTP yearly files: ${yearly.length}; last: ${yearly.slice(-6).map(i => `${i.name} ${Math.round(i.size / 1e6)}MB`).join(', ')}`)
    const lastDoc = yearly.filter(i => /doc-rec\.txt$/i.test(i.name)).pop()
    const lastNme = yearly.filter(i => /nme-rec\.txt$/i.test(i.name)).pop()
    for (const f of [lastDoc, lastNme].filter(Boolean)) {
      const lines = await head(sftp, `/OR_Yearly_Exports/${f.name}`)
      lines.forEach(l => log(`BCFTP ${f.name} | ${l.slice(0, 400)}`))
    }
    const dirs = (await sftp.list('/')).map(i => `${i.type}${i.name}`)
    log('BCFTP root:', dirs.join(', '))
    await sftp.end()
  } catch (e) { log(`BCFTP error ${e.message}`) }
  log('done')
}

function startProbe() {
  if (process.env.DATA_PROBE !== 'on') return
  setTimeout(() => runProbe().catch(e => log('failed', e.message)), 20 * 1000)
}

module.exports = { startProbe, runProbe }
