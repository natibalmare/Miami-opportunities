// backend/routes/admin.js
// Owner-only: business insights, members list, and email / text campaigns.

const crypto = require('crypto')
const router = require('express').Router()
const fetch = require('node-fetch')
const { query } = require('../db/pool')
const { requireAdmin } = require('../middleware/auth')
const { ACTIVE } = require('../utils/access')
const { PLANS } = require('./payments')
const { sendCampaignEmails, sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer')

router.use(requireAdmin)

const site = () => (process.env.FRONTEND_URL || 'https://miamiopportunities.com').replace(/\/$/, '')
const api = () => (process.env.PUBLIC_API_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : site())).replace(/\/$/, '')
const unsubToken = (id) => crypto.createHmac('sha256', process.env.JWT_SECRET || 'mo').update(`unsub:${id}`).digest('hex').slice(0, 32)
const n = (v) => Number(v) || 0

async function setting(key) {
  const r = await query('SELECT value FROM app_settings WHERE key=$1', [key])
  return r.rows[0]?.value || ''
}

/* GET /api/admin/overview */
router.get('/overview', async (req, res) => {
  try {
    const [users, roles, subs, signups, reports, searches, board, msgs, revenue] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE email_verified)::int AS verified,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS last7,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS last30,
                    COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days')::int AS active7,
                    COUNT(*) FILTER (WHERE sms_opt_in)::int AS sms_ok,
                    COUNT(*) FILTER (WHERE NOT email_opt_out)::int AS email_ok
               FROM users`),
      query(`SELECT COALESCE(role,'buyer') AS role, COUNT(*)::int AS n FROM users GROUP BY 1 ORDER BY 2 DESC`),
      query(`SELECT plan, billing_interval, COUNT(*)::int AS n FROM subscriptions WHERE status = ANY($1) GROUP BY 1,2`, [ACTIVE]),
      query(`SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(c.n, 0)::int AS n
               FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, INTERVAL '1 day') d
               LEFT JOIN (SELECT created_at::date AS day, COUNT(*) AS n FROM users WHERE created_at > CURRENT_DATE - 30 GROUP BY 1) c ON c.day = d::date
              ORDER BY 1`),
      query(`SELECT COUNT(*) FILTER (WHERE source = 'stripe')::int AS single,
                    COUNT(*) FILTER (WHERE source = 'membership')::int AS membership,
                    COUNT(*) FILTER (WHERE source = 'overage')::int AS overage,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS last30,
                    COALESCE(SUM(amount) FILTER (WHERE source IN ('stripe','overage')), 0) AS paid_total
               FROM report_purchases WHERE status = 'completed'`),
      query(`SELECT action, COUNT(*)::int AS n FROM audit_logs WHERE created_at > NOW() - INTERVAL '30 days'
              AND action IN ('search','criteria_search','board_post') GROUP BY 1`),
      query(`SELECT listing_type, status, COALESCE(outcome,'') AS outcome, (created_at > NOW() - INTERVAL '24 hours') AS early, COUNT(*)::int AS n, COALESCE(SUM(views),0)::int AS views FROM board_listings GROUP BY 1,2,3,4`),
      query(`SELECT (SELECT COUNT(*) FROM conversations)::int AS conversations, (SELECT COUNT(*) FROM messages)::int AS messages`),
      query(`SELECT COALESCE(SUM(amount),0) AS overage FROM overage_purchases WHERE status='completed'`).catch(() => ({ rows: [{ overage: 0 }] })),
    ])

    let mrr = 0
    const byPlan = {}
    for (const s of subs.rows) {
      const p = PLANS[s.plan]
      if (!p) continue
      byPlan[s.plan] = (byPlan[s.plan] || 0) + s.n
      mrr += s.n * (s.billing_interval === 'year' ? p.amounts.year / 12 : p.amounts.month)
    }
    const act = Object.fromEntries(searches.rows.map(r => [r.action, r.n]))

    res.json({
      users: users.rows[0],
      roles: roles.rows,
      members: { byPlan, total: Object.values(byPlan).reduce((a, b) => a + b, 0), mrr: Math.round(mrr) },
      revenue: { reportSales: n(reports.rows[0].paid_total), overage: n(revenue.rows[0].overage) },
      signups: signups.rows,
      reports: reports.rows[0],
      activity30: { searches: act.search || 0, criteriaSearches: act.criteria_search || 0, boardPosts: act.board_post || 0 },
      board: board.rows,
      messaging: msgs.rows[0],
      generatedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('Admin overview failed:', e.message)
    res.status(500).json({ error: 'Insights unavailable' })
  }
})

/* POST /api/admin/users/:id/action — support tools: resend_verification | send_reset | mark_verified | sign_out */
router.post('/users/:id/action', async (req, res) => {
  try {
    const action = String(req.body.action || '')
    const r = await query('SELECT id, email, first_name, email_verified FROM users WHERE id=$1', [req.params.id])
    const u = r.rows[0]
    if (!u) return res.status(404).json({ error: 'Member not found' })
    let message
    if (action === 'resend_verification') {
      if (u.email_verified) return res.json({ message: 'This email is already verified.' })
      const code = crypto.randomInt(100000, 1000000).toString()
      await query('UPDATE users SET email_verify_code=$1, email_verify_expires=$2 WHERE id=$3', [code, new Date(Date.now() + 24 * 3600 * 1000), u.id])
      const ok = await sendVerificationEmail(u.email, u.first_name, code)
      message = ok === false ? 'The email service did not accept the message — check Resend.' : `New verification code sent to ${u.email} (valid 24 hours).`
    } else if (action === 'send_reset') {
      const code = crypto.randomInt(100000, 1000000).toString()
      const hash = crypto.createHash('sha256').update(code).digest('hex')
      await query('UPDATE users SET reset_code=$1, reset_expires=$2, reset_attempts=0 WHERE id=$3', [hash, new Date(Date.now() + 15 * 60 * 1000), u.id])
      const ok = await sendPasswordResetEmail(u.email, u.first_name, code)
      message = ok === false ? 'The email service did not accept the message — check Resend.' : `Password reset code sent to ${u.email} (valid 15 minutes).`
    } else if (action === 'mark_verified') {
      await query('UPDATE users SET email_verified=true, email_verify_code=NULL WHERE id=$1', [u.id])
      message = `${u.email} is now marked verified.`
    } else if (action === 'sign_out') {
      await query('UPDATE users SET session_id=NULL WHERE id=$1', [u.id])
      message = `${u.email} was signed out of every device.`
    } else {
      return res.status(400).json({ error: 'Unknown action' })
    }
    query(`INSERT INTO audit_logs (user_id, action, resource, resource_id) VALUES ($1,$2,'users',$3)`, [req.user.id, `admin_${action}`, u.id]).catch(() => {})
    res.json({ message })
  } catch (e) {
    console.error('Admin action failed:', e.message)
    res.status(500).json({ error: 'Action failed' })
  }
})

/* GET /api/admin/users?q=&limit= — members list */
router.get('/users', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const params = []
    let where = ''
    if (q) { params.push(`%${q}%`); where = `WHERE u.email ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1` }
    const r = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.role, u.email_verified, u.created_at, u.last_login_at,
              u.sms_opt_in, u.email_opt_out, s.plan, s.status, s.billing_interval, s.current_period_end
         FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id
         ${where} ORDER BY u.created_at DESC LIMIT 300`, params)
    res.json({ users: r.rows.map(u => ({
      id: u.id, name: `${u.first_name} ${u.last_name}`, email: u.email, phone: u.phone, role: u.role,
      verified: u.email_verified, joined: u.created_at, lastLogin: u.last_login_at,
      plan: u.plan && ACTIVE.includes(u.status) ? u.plan : 'free', interval: u.billing_interval, renews: u.current_period_end,
      smsOk: u.sms_opt_in, emailOk: !u.email_opt_out,
    })) })
  } catch (e) {
    console.error('Admin users failed:', e.message)
    res.status(500).json({ error: 'Members unavailable' })
  }
})

/* ── Campaigns ─────────────────────────────────────────────────────────────── */

function audienceSql(audience, channel) {
  const where = channel === 'sms'
    ? [`u.sms_opt_in = true`, `u.phone IS NOT NULL`]
    : [`u.email_opt_out = false`, `u.email_verified = true`]
  const params = []
  const add = (v) => { params.push(v); return `$${params.length}` }
  const paid = () => `EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status = ANY(${add(ACTIVE)}))`
  if (audience === 'paid') where.push(paid())
  else if (audience === 'free') where.push(`NOT ${paid()}`)
  else if (audience?.startsWith('role:')) where.push(`u.role = ${add(audience.slice(5))}`)
  else if (audience?.startsWith('plan:')) where.push(`EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status = ANY(${add(ACTIVE)}) AND s.plan = ${add(audience.slice(5))})`)
  else if (audience !== 'all') return null
  return { sql: `SELECT u.id, u.email, u.first_name, u.phone FROM users u WHERE ${where.join(' AND ')}`, params }
}

/* GET /api/admin/campaigns — settings, history, and whether texting is connected */
router.get('/campaigns', async (req, res) => {
  try {
    const hist = await query('SELECT id, channel, audience, subject, body, recipients, sent, failed, created_at FROM campaigns ORDER BY created_at DESC LIMIT 50')
    res.json({
      mailingAddress: await setting('mailing_address'),
      smsConnected: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)),
      history: hist.rows,
    })
  } catch (e) {
    console.error('Campaigns failed:', e.message)
    res.status(500).json({ error: 'Campaigns unavailable' })
  }
})

/* PUT /api/admin/settings — { mailingAddress } */
router.put('/settings', async (req, res) => {
  try {
    const v = String(req.body.mailingAddress || '').trim().slice(0, 300)
    await query(`INSERT INTO app_settings (key, value, updated_at) VALUES ('mailing_address', $1, NOW())
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [v])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Could not save' }) }
})

/* POST /api/admin/campaigns/preview — { channel, audience } → how many people */
router.post('/campaigns/preview', async (req, res) => {
  try {
    const a = audienceSql(req.body.audience, req.body.channel)
    if (!a) return res.status(400).json({ error: 'Unknown audience' })
    const r = await query(`SELECT COUNT(*)::int AS n FROM (${a.sql}) x`, a.params)
    res.json({ recipients: r.rows[0].n })
  } catch (e) { res.status(500).json({ error: 'Preview failed' }) }
})

async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const form = new URLSearchParams({ To: to, Body: body })
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID)
  else form.set('From', process.env.TWILIO_FROM)
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  if (!r.ok) throw new Error(`Twilio ${r.status}`)
}

const toE164 = (p) => {
  const d = String(p || '').replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return null
}

/* POST /api/admin/campaigns/send — { channel: 'email'|'sms', audience, subject, body } */
router.post('/campaigns/send', async (req, res) => {
  try {
    const { channel, audience } = req.body
    const subject = String(req.body.subject || '').trim().slice(0, 150)
    const body = String(req.body.body || '').trim()
    if (!['email', 'sms'].includes(channel)) return res.status(400).json({ error: 'Choose email or text' })
    if (!body) return res.status(400).json({ error: 'Write your message first' })
    const a = audienceSql(audience, channel)
    if (!a) return res.status(400).json({ error: 'Unknown audience' })

    const list = (await query(a.sql, a.params)).rows
    if (!list.length) return res.status(400).json({ error: 'Nobody in this audience can receive this message yet' })
    let result

    if (channel === 'email') {
      if (!subject) return res.status(400).json({ error: 'Add a subject line' })
      const address = await setting('mailing_address')
      if (!address) return res.status(400).json({ error: 'Add your business mailing address first (required by law in marketing emails)' })
      result = await sendCampaignEmails(list.map(u => ({
        email: u.email, firstName: u.first_name,
        unsubscribeUrl: `${api()}/api/auth/unsubscribe?u=${u.id}&t=${unsubToken(u.id)}`,
      })), subject, body, address)
    } else {
      if (!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID))) {
        return res.status(400).json({ error: 'Texting is not connected yet' })
      }
      const text = `MO Miami Opportunities: ${body.slice(0, 280)} Reply STOP to opt out.`
      let sent = 0, failed = 0
      for (const u of list) {
        const to = toE164(u.phone)
        if (!to) { failed++; continue }
        try { await sendSms(to, text); sent++ } catch (e) { failed++; console.error('SMS failed:', e.message) }
      }
      result = { sent, failed }
    }

    await query(`INSERT INTO campaigns (channel, audience, subject, body, recipients, sent, failed, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [channel, audience, subject || null, body, list.length, result.sent, result.failed, req.user.id])
    res.json({ recipients: list.length, ...result })
  } catch (e) {
    console.error('Campaign send failed:', e.message)
    res.status(500).json({ error: 'Campaign failed to send' })
  }
})

module.exports = router
module.exports.unsubToken = unsubToken
