// backend/routes/messages.js
// Private in-app messages between board members. Phone numbers and emails are never exchanged by MO.

const router = require('express').Router()
const { query } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')
const { canContact, getUser } = require('../utils/access')
const { sendNewMessageEmail } = require('../utils/mailer')

const MAX_LEN = 2000
const MAX_NEW_PER_DAY = 20
const shortName = (first, last) => `${first || ''} ${last ? last[0] + '.' : ''}`.trim() || 'Member'
const listingTitle = (l) => l?.title || (l?.listing_type === 'fsbo' ? (l.address || 'your property') : (l?.target_area ? `buyer post — ${l.target_area}` : 'your post'))

async function notify(recipientId, senderId, listing, body) {
  try {
    const [to, from] = await Promise.all([getUser(recipientId), getUser(senderId)])
    if (to?.email) await sendNewMessageEmail(to.email, to.first_name, shortName(from?.first_name, from?.last_name), listingTitle(listing), body)
  } catch (e) { console.error('Message email failed:', e.message) }
}

/* POST /api/messages/start — { listingId, body } */
router.post('/start', requireAuth, async (req, res) => {
  try {
    const body = String(req.body.body || '').trim().slice(0, MAX_LEN)
    if (body.length < 2) return res.status(400).json({ error: 'Write a message first' })
    const l = (await query('SELECT * FROM board_listings WHERE id=$1', [req.body.listingId])).rows[0]
    if (!l) return res.status(404).json({ error: 'Post not found' })
    const me = await getUser(req.user.id)
    const check = await canContact(me, l)
    if (!check.ok) return res.status(403).json({ error: check.reason, upgrade: !!check.upgrade })

    let conv = (await query('SELECT id FROM conversations WHERE listing_id=$1 AND starter_id=$2', [l.id, me.id])).rows[0]
    if (!conv) {
      const today = await query(`SELECT COUNT(*)::int AS n FROM conversations WHERE starter_id=$1 AND created_at > NOW() - INTERVAL '1 day'`, [me.id])
      if (today.rows[0].n >= MAX_NEW_PER_DAY) return res.status(429).json({ error: 'You have reached today’s limit for new conversations. Please try again tomorrow.' })
      conv = (await query('INSERT INTO conversations (listing_id, starter_id, owner_id) VALUES ($1,$2,$3) RETURNING id', [l.id, me.id, l.user_id])).rows[0]
    }
    await query('INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1,$2,$3)', [conv.id, me.id, body])
    await query('UPDATE conversations SET last_message_at=NOW() WHERE id=$1', [conv.id])
    notify(l.user_id, me.id, l, body)
    res.status(201).json({ conversationId: conv.id })
  } catch (e) {
    console.error('Start conversation failed:', e.message)
    res.status(500).json({ error: 'Message not sent' })
  }
})

/* GET /api/messages — my conversations */
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await query(
      `SELECT c.id, c.last_message_at, c.listing_id, c.starter_id, c.owner_id,
              b.title, b.address, b.listing_type, b.target_area, b.status AS listing_status,
              o.first_name AS other_first, o.last_name AS other_last, o.role AS other_role,
              (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_body,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> $1 AND m.read_at IS NULL)::int AS unread
         FROM conversations c
         LEFT JOIN board_listings b ON b.id = c.listing_id
         JOIN users o ON o.id = CASE WHEN c.starter_id = $1 THEN c.owner_id ELSE c.starter_id END
        WHERE c.starter_id = $1 OR c.owner_id = $1
        ORDER BY c.last_message_at DESC LIMIT 200`, [req.user.id])
    res.json({
      conversations: r.rows.map(x => ({
        id: x.id, lastMessageAt: x.last_message_at, lastBody: x.last_body, unread: x.unread,
        with: shortName(x.other_first, x.other_last), withRole: x.other_role,
        listingId: x.listing_id, listingTitle: listingTitle(x), listingStatus: x.listing_status,
        iAmOwner: x.owner_id === req.user.id,
      })),
    })
  } catch (e) {
    console.error('Inbox failed:', e.message)
    res.status(500).json({ error: 'Could not load messages' })
  }
})

/* GET /api/messages/unread-count */
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE (c.starter_id = $1 OR c.owner_id = $1) AND m.sender_id <> $1 AND m.read_at IS NULL`, [req.user.id])
    res.json({ unread: r.rows[0].n })
  } catch (e) { res.json({ unread: 0 }) }
})

async function myConversation(id, userId) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const r = await query(
    `SELECT c.*, b.title, b.address, b.listing_type, b.target_area FROM conversations c
       LEFT JOIN board_listings b ON b.id = c.listing_id
      WHERE c.id=$1 AND (c.starter_id=$2 OR c.owner_id=$2)`, [id, userId])
  return r.rows[0] || null
}

/* GET /api/messages/:id — one conversation (marks incoming messages as read) */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const c = await myConversation(req.params.id, req.user.id)
    if (!c) return res.status(404).json({ error: 'Conversation not found' })
    const otherId = c.starter_id === req.user.id ? c.owner_id : c.starter_id
    const [msgs, other] = await Promise.all([
      query('SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC LIMIT 500', [c.id]),
      getUser(otherId),
    ])
    await query('UPDATE messages SET read_at=NOW() WHERE conversation_id=$1 AND sender_id<>$2 AND read_at IS NULL', [c.id, req.user.id])
    res.json({
      id: c.id, listingId: c.listing_id, listingTitle: listingTitle(c),
      with: shortName(other?.first_name, other?.last_name), withRole: other?.role,
      messages: msgs.rows.map(m => ({ id: m.id, mine: m.sender_id === req.user.id, body: m.body, at: m.created_at })),
    })
  } catch (e) {
    console.error('Conversation failed:', e.message)
    res.status(500).json({ error: 'Could not load the conversation' })
  }
})

/* POST /api/messages/:id — reply */
router.post('/:id', requireAuth, async (req, res) => {
  try {
    const body = String(req.body.body || '').trim().slice(0, MAX_LEN)
    if (body.length < 1) return res.status(400).json({ error: 'Write a message first' })
    const c = await myConversation(req.params.id, req.user.id)
    if (!c) return res.status(404).json({ error: 'Conversation not found' })
    await query('INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1,$2,$3)', [c.id, req.user.id, body])
    await query('UPDATE conversations SET last_message_at=NOW() WHERE id=$1', [c.id])
    const otherId = c.starter_id === req.user.id ? c.owner_id : c.starter_id
    /* Email only if the other person has nothing unread from earlier — avoids an email for every line */
    const pending = await query('SELECT COUNT(*)::int AS n FROM messages WHERE conversation_id=$1 AND sender_id=$2 AND read_at IS NULL', [c.id, req.user.id])
    if (pending.rows[0].n <= 1) notify(otherId, req.user.id, c, body)
    res.status(201).json({ ok: true })
  } catch (e) {
    console.error('Reply failed:', e.message)
    res.status(500).json({ error: 'Message not sent' })
  }
})

module.exports = router
