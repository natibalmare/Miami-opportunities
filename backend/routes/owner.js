// backend/routes/owner.js
// Owner contact lookup (skip trace) and Street View photo for unlocked reports.

const router = require('express').Router()
const fetch = require('node-fetch')
const { query, pool } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')
const { isAdminEmail, activePlan } = require('../utils/access')
const { PLANS, alreadyOwned, normFolio } = require('./payments')
const { skipTrace, configured } = require('../adapters/batchdata')

const CACHE_DAYS = 180
const FREE_MONTHLY_CAP = 5 /* single-report buyers without a plan */

const addrKey = (a) => [a.street, a.zip].map(x => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).join('|')

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS skip_traces (
    id SERIAL PRIMARY KEY, address_key TEXT NOT NULL, result JSONB NOT NULL, user_id UUID, created_at TIMESTAMPTZ DEFAULT NOW())`)
  await query(`CREATE INDEX IF NOT EXISTS idx_skip_traces_key ON skip_traces (address_key, created_at DESC)`)
}
ensureTable().catch(e => console.error('skip_traces table:', e.message))

/* POST /api/owner/contact — { folio, street, city, zip } */
router.post('/contact', requireAuth, async (req, res) => {
  try {
    const folio = normFolio(req.body.folio)
    const address = { street: String(req.body.street || '').trim(), city: String(req.body.city || '').trim(), state: 'FL', zip: String(req.body.zip || '').slice(0, 5) }
    if (!folio || !address.street || !address.zip) return res.status(400).json({ error: 'Property address is required' })

    const admin = isAdminEmail(req.user.email)
    if (!admin && !(await alreadyOwned(pool, req.user.id, folio))) return res.status(403).json({ error: 'Unlock the full report to see owner contact information.' })

    const key = addrKey(address)
    const cached = await query(`SELECT result, created_at FROM skip_traces WHERE address_key=$1 AND created_at > NOW() - INTERVAL '${CACHE_DAYS} days' ORDER BY created_at DESC LIMIT 1`, [key])
    if (cached.rows[0]) return res.json({ persons: cached.rows[0].result, checkedAt: cached.rows[0].created_at, cached: true })

    if (!configured()) return res.status(503).json({ error: 'Owner contact lookup is being connected. Please check back soon.' })

    if (!admin) {
      const plan = await activePlan(req.user.id)
      const cap = PLANS[plan]?.reports || FREE_MONTHLY_CAP
      const used = await query(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE user_id=$1 AND action='skip_trace' AND created_at > date_trunc('month', NOW())`, [req.user.id])
      if (used.rows[0].n >= cap) return res.status(429).json({ error: `You have used this month’s ${cap} owner lookups.` })
    }

    const persons = await skipTrace(address)
    await query('INSERT INTO skip_traces (address_key, result, user_id) VALUES ($1,$2,$3)', [key, JSON.stringify(persons), req.user.id])
    query(`INSERT INTO audit_logs (user_id, action, resource, resource_id) VALUES ($1,'skip_trace','property',$2)`, [req.user.id, folio]).catch(() => {})
    res.json({ persons, checkedAt: new Date().toISOString(), cached: false })
  } catch (e) {
    console.error('Owner contact failed:', e.message)
    res.status(e.code === 'NOT_CONFIGURED' ? 503 : 502).json({ error: e.message || 'Owner lookup failed' })
  }
})

/* GET /api/owner/streetview?address= — street-level photo (Google key stays on the server) */
const svCache = new Map()
router.get('/streetview', requireAuth, async (req, res) => {
  try {
    const key = process.env.GOOGLE_MAPS_KEY
    const address = String(req.query.address || '').slice(0, 200)
    if (!key || !address) return res.status(404).end()
    if (!svCache.has(address)) {
      if (svCache.size > 5000) svCache.clear()
      const m = await (await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(address)}&source=outdoor&key=${key}`, { timeout: 10000 })).json()
      svCache.set(address, m.status === 'OK' ? (m.date || 'ok') : null)
    }
    if (!svCache.get(address)) return res.status(404).end()
    const img = await fetch(`https://maps.googleapis.com/maps/api/streetview?size=640x320&scale=2&fov=80&source=outdoor&location=${encodeURIComponent(address)}&key=${key}`, { timeout: 15000 })
    if (!img.ok) return res.status(404).end()
    res.set('Content-Type', img.headers.get('content-type') || 'image/jpeg')
    res.set('Cache-Control', 'private, max-age=604800')
    res.set('X-Imagery-Date', String(svCache.get(address)))
    img.body.pipe(res)
  } catch (e) {
    res.status(404).end()
  }
})

module.exports = router
