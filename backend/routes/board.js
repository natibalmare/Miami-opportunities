// backend/routes/board.js
// Buyer / Seller Board: FSBO property posts (free) and buyer "wanted" posts.
// Contact details are never shown — people connect through in-app messages.

const router = require('express').Router()
const { query } = require('../db/pool')
const { requireAuth, optionalAuth } = require('../middleware/auth')
const { canContact, getUser } = require('../utils/access')

const TYPES = ['fsbo', 'buyer']
const MAX_ACTIVE_POSTS = 3
const PROPERTY_TYPES = ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Land', 'Commercial', 'Other']

const clean = (v, max = 200) => (v === undefined || v === null) ? null : String(v).trim().slice(0, max) || null
const int = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null }
const dec = (v) => { const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : null }
const shortName = (first, last) => `${first || ''} ${last ? last[0] + '.' : ''}`.trim() || 'Member'

const PUBLIC_COLS = `b.id, b.listing_type, b.role, b.has_agent, b.title, b.address, b.city, b.zip, b.price, b.beds, b.baths,
  b.living_sqft, b.property_type, b.target_area, b.budget, b.message, b.agents_ok, b.status, b.views, b.created_at,
  b.user_id, u.first_name, u.last_name, u.role AS poster_role`

const toPublic = (r, viewerId) => ({
  id: r.id, type: r.listing_type, hasAgent: r.has_agent, title: r.title,
  address: r.address, city: r.city, zip: r.zip, price: r.price ? Number(r.price) : null,
  beds: r.beds, baths: r.baths !== null && r.baths !== undefined ? Number(r.baths) : null,
  livingSqft: r.living_sqft, propertyType: r.property_type,
  area: r.target_area, budget: r.budget, message: r.message, agentsOk: r.agents_ok,
  status: r.status, views: r.views, createdAt: r.created_at,
  poster: shortName(r.first_name, r.last_name), posterRole: r.poster_role,
  mine: !!viewerId && r.user_id === viewerId,
})

/* Count each viewer once per post per day (kept in memory; resets on restart) */
const seen = new Map()
function firstView(key) {
  const day = new Date().toISOString().slice(0, 10)
  if (seen.get(key) === day) return false
  if (seen.size > 50000) seen.clear()
  seen.set(key, day)
  return true
}

/* GET /api/board?type=fsbo|buyer&zip=&maxPrice=&needsAgent=1 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const where = [`b.status = 'active'`]
    const params = []
    if (TYPES.includes(req.query.type)) { params.push(req.query.type); where.push(`b.listing_type = $${params.length}`) }
    if (req.query.zip) { params.push(String(req.query.zip).slice(0, 5)); where.push(`b.zip = $${params.length}`) }
    const maxPrice = int(req.query.maxPrice)
    if (maxPrice) { params.push(maxPrice); where.push(`b.price <= $${params.length}`) }
    if (req.query.needsAgent === '1') where.push(`b.has_agent = false`)
    const r = await query(
      `SELECT ${PUBLIC_COLS} FROM board_listings b JOIN users u ON u.id = b.user_id
        WHERE ${where.join(' AND ')} ORDER BY b.created_at DESC LIMIT 200`, params)
    res.json({ listings: r.rows.map(x => toPublic(x, req.user?.id)) })
  } catch (e) {
    console.error('Board list failed:', e.message)
    res.status(500).json({ error: 'Board unavailable' })
  }
})

/* GET /api/board/mine — my posts with views and inquiries */
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const r = await query(
      `SELECT ${PUBLIC_COLS},
              (SELECT COUNT(*) FROM conversations c WHERE c.listing_id = b.id)::int AS inquiries,
              (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
                 WHERE c.listing_id = b.id AND m.sender_id <> b.user_id AND m.read_at IS NULL)::int AS unread
         FROM board_listings b JOIN users u ON u.id = b.user_id
        WHERE b.user_id = $1 AND b.status <> 'removed' ORDER BY b.created_at DESC`, [req.user.id])
    res.json({ listings: r.rows.map(x => ({ ...toPublic(x, req.user.id), inquiries: x.inquiries, unread: x.unread })) })
  } catch (e) {
    console.error('My posts failed:', e.message)
    res.status(500).json({ error: 'Could not load your posts' })
  }
})

/* GET /api/board/:id — one post (counts a view) */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'Post not found' })
    const r = await query(`SELECT ${PUBLIC_COLS} FROM board_listings b JOIN users u ON u.id = b.user_id WHERE b.id = $1 AND b.status <> 'removed'`, [req.params.id])
    const row = r.rows[0]
    if (!row) return res.status(404).json({ error: 'Post not found' })
    if (row.user_id !== req.user?.id && firstView(`${row.id}|${req.user?.id || req.ip}`)) {
      query('UPDATE board_listings SET views = views + 1 WHERE id = $1', [row.id]).catch(() => {})
      row.views += 1
    }
    let contact = { ok: false, reason: 'Sign in to send a message.' }
    if (req.user) contact = await canContact(await getUser(req.user.id), { ...row })
    res.json({ listing: toPublic(row, req.user?.id), contact })
  } catch (e) {
    console.error('Board post failed:', e.message)
    res.status(500).json({ error: 'Post unavailable' })
  }
})

function readBody(b, type) {
  return {
    title: clean(b.title, 120),
    address: type === 'fsbo' ? clean(b.address, 160) : null,
    city: clean(b.city, 80), zip: clean(b.zip, 5),
    price: type === 'fsbo' ? int(b.price) : null,
    beds: int(b.beds), baths: dec(b.baths), living_sqft: int(b.livingSqft),
    property_type: PROPERTY_TYPES.includes(b.propertyType) ? b.propertyType : null,
    target_area: type === 'buyer' ? clean(b.area, 160) : null,
    budget: type === 'buyer' ? clean(b.budget, 80) : null,
    message: clean(b.message, 2000),
    has_agent: !!b.hasAgent,
    agents_ok: b.agentsOk === undefined ? true : !!b.agentsOk,
  }
}

/* POST /api/board — create a post (free) */
router.post('/', requireAuth, async (req, res) => {
  try {
    const type = req.body.type
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'Choose "For sale by owner" or "Buyer looking"' })
    const d = readBody(req.body, type)
    if (type === 'fsbo' && (!d.address || !d.zip || !d.price)) return res.status(400).json({ error: 'Address, ZIP code and asking price are required' })
    if (type === 'buyer' && (!d.target_area || !d.budget)) return res.status(400).json({ error: 'Area and budget are required' })
    if (!d.message) return res.status(400).json({ error: 'Please add a short description' })
    const count = await query(`SELECT COUNT(*)::int AS n FROM board_listings WHERE user_id=$1 AND status='active'`, [req.user.id])
    if (count.rows[0].n >= MAX_ACTIVE_POSTS) return res.status(400).json({ error: `You can have up to ${MAX_ACTIVE_POSTS} active posts. Mark one sold or remove it first.` })

    const r = await query(
      `INSERT INTO board_listings (user_id, role, listing_type, title, address, city, zip, price, beds, baths, living_sqft,
          property_type, target_area, budget, message, has_agent, agents_ok, show_phone, show_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,false,false) RETURNING id`,
      [req.user.id, type === 'fsbo' ? 'seller' : 'buyer', type, d.title, d.address, d.city, d.zip, d.price, d.beds, d.baths, d.living_sqft,
       d.property_type, d.target_area, d.budget, d.message, d.has_agent, d.agents_ok])
    query(`INSERT INTO audit_logs (user_id, action, resource, resource_id) VALUES ($1,'board_post','board_listings',$2)`, [req.user.id, r.rows[0].id]).catch(() => {})
    res.status(201).json({ id: r.rows[0].id })
  } catch (e) {
    console.error('Board post create failed:', e.message)
    res.status(500).json({ error: 'Could not publish your post' })
  }
})

/* PATCH /api/board/:id — edit, mark sold, pause or remove (owner only) */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const cur = await query('SELECT * FROM board_listings WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])
    const row = cur.rows[0]
    if (!row) return res.status(404).json({ error: 'Post not found' })
    if (req.body.status) {
      if (!['active', 'paused', 'sold', 'removed'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' })
      await query('UPDATE board_listings SET status=$1, active=$2, updated_at=NOW() WHERE id=$3', [req.body.status, req.body.status === 'active', row.id])
      return res.json({ ok: true })
    }
    const d = readBody({ ...req.body, type: row.listing_type }, row.listing_type)
    await query(
      `UPDATE board_listings SET title=$1, address=COALESCE($2,address), city=$3, zip=COALESCE($4,zip), price=COALESCE($5,price), beds=$6, baths=$7,
              living_sqft=$8, property_type=$9, target_area=COALESCE($10,target_area), budget=COALESCE($11,budget),
              message=COALESCE($12,message), has_agent=$13, agents_ok=$14, updated_at=NOW()
        WHERE id=$15`,
      [d.title, d.address, d.city, d.zip, d.price, d.beds, d.baths, d.living_sqft, d.property_type, d.target_area, d.budget, d.message, d.has_agent, d.agents_ok, row.id])
    res.json({ ok: true })
  } catch (e) {
    console.error('Board post update failed:', e.message)
    res.status(500).json({ error: 'Could not update your post' })
  }
})

module.exports = router
module.exports.PROPERTY_TYPES = PROPERTY_TYPES
