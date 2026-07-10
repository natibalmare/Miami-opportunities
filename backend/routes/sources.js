const router = require('express').Router()
const { query } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')

/* GET /api/sources */
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await query('SELECT id, name, source_url, api_type, status, last_tested, confidence, error_message FROM data_sources ORDER BY name')
    res.json(r.rows)
  } catch (e) {
    res.status(500).json({ error: 'Sources fetch failed' })
  }
})

/* POST /api/sources/:id/test — ping each source */
router.post('/:id/test', requireAuth, async (req, res) => {
  try {
    const r = await query('SELECT * FROM data_sources WHERE id=$1', [req.params.id])
    const src = r.rows[0]
    if (!src) return res.status(404).json({ error: 'Source not found' })

    let ok = false, msg = ''
    if (src.source_url) {
      try {
        const fetch = require('node-fetch')
        const resp = await fetch(src.source_url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
        ok = resp.ok || resp.status < 500
        msg = `HTTP ${resp.status}`
      } catch (e) {
        msg = e.message
      }
    } else {
      msg = 'No URL configured'
    }

    await query(
      `UPDATE data_sources SET last_tested=NOW(), status=$1, confidence=$2, error_message=$3 WHERE id=$4`,
      [ok ? (src.status === 'pending' ? 'reachable' : src.status) : 'error', ok ? src.confidence || 50 : 0, ok ? null : msg, src.id]
    )

    res.json({ success: ok, status: ok ? 'reachable' : 'error', message: msg })
  } catch (e) {
    res.status(500).json({ error: 'Test failed' })
  }
})

module.exports = router
