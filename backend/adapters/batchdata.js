// backend/adapters/batchdata.js
// Owner phone / email lookup (skip tracing) through BatchData — the API behind BatchSkipTracing.
// Each successful match is billed by BatchData, so results are cached and calls are limited per member.

const fetch = require('node-fetch')

const URL = 'https://api.batchdata.com/api/v1/property/skip-trace'

const configured = () => !!process.env.BATCH_SKIP_API_KEY

/* address: { street, city, state, zip } */
async function skipTrace(address) {
  if (!configured()) throw Object.assign(new Error('Owner lookup is not connected yet'), { code: 'NOT_CONFIGURED' })
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.BATCH_SKIP_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ requests: [{ propertyAddress: address }] }),
    timeout: 30000,
  })
  const text = await r.text()
  let j = {}
  try { j = JSON.parse(text) } catch { /* not JSON */ }
  if (!r.ok) {
    console.error('BatchData error', r.status, text.slice(0, 300))
    throw Object.assign(new Error(r.status === 401 || r.status === 403 ? 'Owner lookup key was rejected' : 'Owner lookup is temporarily unavailable'), { code: `HTTP_${r.status}` })
  }
  const persons = j?.results?.persons || j?.results?.[0]?.persons || []
  return persons.slice(0, 3).map(p => ({
    name: [p?.name?.first, p?.name?.middle, p?.name?.last].filter(Boolean).join(' ') || p?.name?.full || null,
    phones: (p.phoneNumbers || []).slice(0, 5).map(ph => ({
      number: ph.number, type: ph.type || null, carrier: ph.carrier || null,
      dnc: !!ph.dnc, tcpa: !!ph.tcpa, reachable: ph.reachable !== false, score: ph.score ?? null,
    })),
    emails: (p.emails || []).slice(0, 4).map(e => ({ email: e.email, verified: !!e.verified })).filter(e => e.email),
    mailing: p.mailingAddress ? [p.mailingAddress.street, p.mailingAddress.city, p.mailingAddress.state, p.mailingAddress.zip].filter(Boolean).join(', ') : null,
    deceased: !!p.death?.deceased,
    litigator: !!p.litigator,
  }))
}

module.exports = { skipTrace, configured }
