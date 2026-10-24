const router = require('express').Router()
/* Managed Payments (on by default for this Stripe account) needs API version 2025-03-31.basil or newer */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' })
const { query, pool } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')

/* ── PLANS ─────────────────────────────────────────────────────────────────────
   Prices live in Stripe; the price IDs come from Railway variables.
   Overage is charged dynamically with price_data (not a Stripe Dashboard product). */
const SINGLE_REPORT = { envKey: 'STRIPE_PRICE_SINGLE_REPORT', amount: 15.00 }

const PLANS = {
  investor: {
    name: 'Investor', reports: 15, seats: 1, overage: 2.99,
    prices: { month: 'STRIPE_PRICE_INVESTOR_MONTHLY', year: 'STRIPE_PRICE_INVESTOR_ANNUAL' },
    amounts: { month: 29, year: 290 },
  },
  agent: {
    name: 'Agent', reports: 15, seats: 1, overage: 2.99,
    prices: { month: 'STRIPE_PRICE_AGENT_MONTHLY', year: 'STRIPE_PRICE_AGENT_ANNUAL' },
    amounts: { month: 49, year: 490 },
  },
  pro: {
    name: 'Pro', reports: 50, seats: 2, overage: 2.49,
    prices: { month: 'STRIPE_PRICE_PRO_MONTHLY', year: 'STRIPE_PRICE_PRO_ANNUAL' },
    amounts: { month: 99, year: 990 },
  },
  business: {
    name: 'Business', reports: 150, seats: 5, overage: 1.99,
    prices: { month: 'STRIPE_PRICE_BUSINESS_MONTHLY', year: 'STRIPE_PRICE_BUSINESS_ANNUAL' },
    amounts: { month: 249, year: 2490 },
  },
}

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due']

const normFolio = (f) => String(f || '').replace(/\D/g, '')
/* Where to send the buyer back after checkout: the search they were on (e.g. a Broward parcel key) */
const returnQuery = (q, folio) => {
  const s = String(q || '').trim()
  return encodeURIComponent(s && s.length <= 120 ? s : folio)
}
const frontend = () => (process.env.FRONTEND_URL || '').replace(/\/$/, '')

/* Find plan + interval from a Stripe price ID */
function planFromPrice(priceId) {
  for (const [key, p] of Object.entries(PLANS)) {
    for (const [interval, envKey] of Object.entries(p.prices)) {
      if (process.env[envKey] && process.env[envKey] === priceId) return { plan: key, interval }
    }
  }
  return null
}

function addMonths(date, n) {
  const d = new Date(date.getTime())
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + n)
  if (d.getUTCDate() < day) d.setUTCDate(0) // e.g. Jan 31 + 1 month → Feb 28/29
  return d
}

async function getOrCreateCustomer(userId) {
  const u = await query('SELECT id, email, first_name, last_name, stripe_customer_id FROM users WHERE id=$1', [userId])
  const user = u.rows[0]
  if (!user) throw new Error('User not found')
  if (user.stripe_customer_id) return user.stripe_customer_id

  const cust = await stripe.customers.create({
    email: user.email,
    name: `${user.first_name} ${user.last_name}`,
    metadata: { user_id: userId },
  })
  await query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [cust.id, userId])
  return cust.id
}

/* ── USAGE WINDOWS ─────────────────────────────────────────────────────────────
   Monthly plans: one window = the Stripe billing period.
   Annual plans: Stripe bills once a year, so we create a new monthly window
   on each monthly anniversary of the subscription start (no cron needed). */
async function ensureUsagePeriod(db, { userId, plan, interval, periodStart, periodEnd }) {
  if (!PLANS[plan] || !periodStart || !periodEnd) return null
  const now = new Date()
  let start = new Date(periodStart)
  let end = new Date(periodEnd)

  if (interval === 'year') {
    const origin = new Date(periodStart)
    let k = 0
    while (k < 12 && addMonths(origin, k + 1) <= now && addMonths(origin, k + 1) < end) k++
    start = addMonths(origin, k)
    const monthEnd = addMonths(origin, k + 1)
    end = monthEnd < end ? monthEnd : end
  }

  const r = await db.query(
    `INSERT INTO usage_periods (user_id, plan, period_start, period_end, reports_included)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, period_start)
     DO UPDATE SET plan = EXCLUDED.plan,
                   period_end = EXCLUDED.period_end,
                   reports_included = EXCLUDED.reports_included
     RETURNING *`,
    [userId, plan, start, end, PLANS[plan].reports]
  )
  return r.rows[0]
}

/* Current usage window for a user, or null when there is no active membership */
async function getCurrentPeriod(db, userId) {
  const s = await db.query('SELECT * FROM subscriptions WHERE user_id=$1', [userId])
  const sub = s.rows[0]
  if (!sub || !ACTIVE_STATUSES.includes(sub.status) || !PLANS[sub.plan]) return { sub: sub || null, period: null }

  const period = await ensureUsagePeriod(db, {
    userId,
    plan: sub.plan,
    interval: sub.billing_interval || 'month',
    periodStart: sub.current_period_start,
    periodEnd: sub.current_period_end,
  })
  const now = new Date()
  const valid = period && new Date(period.period_start) <= now && now < new Date(period.period_end)
  return { sub, period: valid ? period : null }
}

async function alreadyOwned(db, userId, folio) {
  const r = await db.query(
    `SELECT id FROM report_purchases WHERE user_id=$1 AND folio=$2 AND status='completed' LIMIT 1`,
    [userId, folio]
  )
  return r.rows.length > 0
}

/* Pull the subscription from Stripe and mirror it in our database */
async function syncSubscription(subId, fallbackUserId) {
  const sub = await stripe.subscriptions.retrieve(subId)
  const item = sub.items?.data?.[0]
  const priceId = item?.price?.id
  const found = planFromPrice(priceId)
  const plan = found?.plan || sub.metadata?.plan
  const interval = found?.interval || item?.price?.recurring?.interval || 'month'

  let userId = sub.metadata?.user_id || fallbackUserId
  if (!userId) {
    const u = await query('SELECT id FROM users WHERE stripe_customer_id=$1', [sub.customer])
    userId = u.rows[0]?.id
  }
  if (!userId || !PLANS[plan]) {
    console.error('syncSubscription: unknown user or plan', { subId, userId, plan, priceId })
    return
  }

  const startUnix = sub.current_period_start ?? item?.current_period_start
  const endUnix = sub.current_period_end ?? item?.current_period_end
  const periodStart = startUnix ? new Date(startUnix * 1000) : null
  const periodEnd = endUnix ? new Date(endUnix * 1000) : null

  await query(
    `INSERT INTO subscriptions
       (user_id, stripe_subscription_id, plan, status, stripe_price_id, billing_interval,
        seats_total, current_period_start, current_period_end, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       plan = EXCLUDED.plan,
       status = EXCLUDED.status,
       stripe_price_id = EXCLUDED.stripe_price_id,
       billing_interval = EXCLUDED.billing_interval,
       seats_total = EXCLUDED.seats_total,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       updated_at = NOW()`,
    [userId, sub.id, plan, sub.status, priceId, interval, PLANS[plan].seats, periodStart, periodEnd]
  )

  if (ACTIVE_STATUSES.includes(sub.status)) {
    await query('UPDATE users SET plan=$1, updated_at=NOW() WHERE id=$2', [plan, userId])
    await ensureUsagePeriod(pool, { userId, plan, interval, periodStart, periodEnd })
  } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
    await query(`UPDATE users SET plan='free', updated_at=NOW() WHERE id=$1`, [userId])
  }
  console.log(`Subscription synced: user=${userId} plan=${plan} status=${sub.status}`)
}

/* ── GET /api/payments/plans — public price list for the pricing UI ─────────── */
router.get('/plans', (req, res) => {
  res.json({
    single: { amount: SINGLE_REPORT.amount },
    plans: Object.entries(PLANS).map(([id, p]) => ({
      id, name: p.name, reports: p.reports, seats: p.seats, overage: p.overage,
      monthly: p.amounts.month, annual: p.amounts.year,
    })),
  })
})

/* ── GET /api/payments/status — plan + reports left this period ─────────────── */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { sub, period } = await getCurrentPeriod(pool, req.user.id)
    const plan = sub && ACTIVE_STATUSES.includes(sub.status) && PLANS[sub.plan] ? sub.plan : 'free'
    res.json({
      plan,
      planName: plan === 'free' ? 'Free' : PLANS[plan].name,
      status: sub?.status || null,
      interval: sub?.billing_interval || null,
      renewsAt: sub?.current_period_end || null,
      seats: plan === 'free' ? 1 : PLANS[plan].seats,
      overagePrice: plan === 'free' ? null : PLANS[plan].overage,
      usage: period ? {
        included: period.reports_included,
        used: period.reports_used,
        remaining: Math.max(0, period.reports_included - period.reports_used),
        periodStart: period.period_start,
        periodEnd: period.period_end,
      } : null,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to load billing status' })
  }
})

/* ── GET /api/payments/access/:folio — is this report unlocked for me? ──────── */
router.get('/access/:folio', requireAuth, async (req, res) => {
  try {
    const folio = normFolio(req.params.folio)
    if (!folio) return res.status(400).json({ error: 'Folio required' })
    res.json({ folio, unlocked: await alreadyOwned(pool, req.user.id, folio) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Access check failed' })
  }
})

/* ── POST /api/payments/checkout — single report, $15 one-time ──────────────── */
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const folio = normFolio(req.body.folio)
    if (!folio) return res.status(400).json({ error: 'Folio required' })
    if (!process.env[SINGLE_REPORT.envKey]) return res.status(500).json({ error: 'Single report price is not configured' })
    if (await alreadyOwned(pool, req.user.id, folio)) return res.json({ alreadyOwned: true })

    const customerId = await getOrCreateCustomer(req.user.id)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{ price: process.env[SINGLE_REPORT.envKey], quantity: 1 }],
      metadata: { type: 'report_single', folio, user_id: req.user.id },
      payment_intent_data: { metadata: { type: 'report_single', folio, user_id: req.user.id } },
      success_url: `${frontend()}/report?q=${returnQuery(req.body.returnQ, folio)}&paid=true`,
      cancel_url: `${frontend()}/report?q=${returnQuery(req.body.returnQ, folio)}&canceled=true`,
    })

    await query(
      `INSERT INTO report_purchases (user_id, folio, amount, stripe_session_id, status, source)
       VALUES ($1,$2,$3,$4,'pending','stripe')`,
      [req.user.id, folio, SINGLE_REPORT.amount, session.id]
    )
    res.json({ url: session.url })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Checkout failed', detail: e.message })
  }
})

/* ── POST /api/payments/membership/checkout — { plan, interval: 'month'|'year' } */
router.post('/membership/checkout', requireAuth, async (req, res) => {
  try {
    const { plan, interval = 'month' } = req.body
    if (!PLANS[plan]) return res.status(400).json({ error: 'Plan must be investor, agent, pro, or business' })
    if (!['month', 'year'].includes(interval)) return res.status(400).json({ error: 'Interval must be month or year' })
    const priceId = process.env[PLANS[plan].prices[interval]]
    if (!priceId) return res.status(500).json({ error: 'This plan price is not configured' })

    /* Already subscribed → send them to the billing portal to change plans */
    const existing = await query('SELECT status FROM subscriptions WHERE user_id=$1', [req.user.id])
    const customerId = await getOrCreateCustomer(req.user.id)
    if (existing.rows[0] && ACTIVE_STATUSES.includes(existing.rows[0].status)) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${frontend()}/account`,
      })
      return res.json({ url: portal.url, portal: true })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { type: 'membership', plan, interval, user_id: req.user.id },
      subscription_data: { metadata: { type: 'membership', plan, user_id: req.user.id } },
      success_url: `${frontend()}/account?subscribed=${plan}`,
      cancel_url: `${frontend()}/account?canceled=true`,
    })
    res.json({ url: session.url })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Subscription checkout failed', detail: e.message })
  }
})

/* ── POST /api/payments/unlock — use 1 report from the membership allowance ─── */
router.post('/unlock', requireAuth, async (req, res) => {
  const folio = normFolio(req.body.folio)
  if (!folio) return res.status(400).json({ error: 'Folio required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (await alreadyOwned(client, req.user.id, folio)) {
      await client.query('ROLLBACK')
      return res.json({ unlocked: true, via: 'already_owned' })
    }

    const { sub, period } = await getCurrentPeriod(client, req.user.id)
    if (!period) {
      await client.query('ROLLBACK')
      return res.status(402).json({ error: 'No active membership. Buy this report or choose a plan.', needsPlan: true })
    }

    const used = await client.query(
      `UPDATE usage_periods SET reports_used = reports_used + 1
       WHERE id=$1 AND reports_used < reports_included
       RETURNING reports_included, reports_used`,
      [period.id]
    )
    if (!used.rows.length) {
      await client.query('ROLLBACK')
      return res.status(402).json({
        error: 'You have used all reports included in your plan this period.',
        needsOverage: true,
        overagePrice: PLANS[sub.plan].overage,
      })
    }

    await client.query(
      `INSERT INTO report_purchases (user_id, folio, amount, status, source)
       VALUES ($1,$2,0,'completed','membership')`,
      [req.user.id, folio]
    )
    await client.query('COMMIT')

    const { reports_included, reports_used } = used.rows[0]
    res.json({ unlocked: true, via: 'membership', remaining: reports_included - reports_used })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(e)
    res.status(500).json({ error: 'Unlock failed', detail: e.message })
  } finally {
    client.release()
  }
})

/* ── POST /api/payments/overage/checkout — extra report after the allowance ─── */
router.post('/overage/checkout', requireAuth, async (req, res) => {
  try {
    const folio = normFolio(req.body.folio)
    if (!folio) return res.status(400).json({ error: 'Folio required' })
    if (await alreadyOwned(pool, req.user.id, folio)) return res.json({ alreadyOwned: true })

    const { sub, period } = await getCurrentPeriod(pool, req.user.id)
    if (!period) return res.status(402).json({ error: 'No active membership', needsPlan: true })
    if (period.reports_used < period.reports_included)
      return res.status(400).json({ error: 'You still have reports included in your plan. Use one of those first.' })

    const amount = PLANS[sub.plan].overage
    const customerId = await getOrCreateCustomer(req.user.id)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amount * 100),
          product_data: { name: `MO Extra Report (${PLANS[sub.plan].name} rate)`, tax_code: 'txcd_10701410' },
        },
        quantity: 1,
      }],
      metadata: { type: 'overage', folio, user_id: req.user.id, usage_period_id: period.id },
      payment_intent_data: { metadata: { type: 'overage', folio, user_id: req.user.id } },
      success_url: `${frontend()}/report?q=${returnQuery(req.body.returnQ, folio)}&paid=true`,
      cancel_url: `${frontend()}/report?q=${returnQuery(req.body.returnQ, folio)}&canceled=true`,
    })

    await query(
      `INSERT INTO overage_purchases (user_id, usage_period_id, folio, amount, stripe_session_id, status)
       VALUES ($1,$2,$3,$4,$5,'pending')`,
      [req.user.id, period.id, folio, amount, session.id]
    )
    res.json({ url: session.url })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Overage checkout failed', detail: e.message })
  }
})

/* ── POST /api/payments/webhook — Stripe events (raw body, set in server.js) ── */
router.post('/webhook', async (req, res) => {
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    console.error('Webhook signature failed:', e.message)
    return res.status(400).send(`Webhook Error: ${e.message}`)
  }

  try {
    const obj = event.data.object

    if (event.type === 'checkout.session.completed') {
      const { type, user_id, folio } = obj.metadata || {}

      if (type === 'report_single' && obj.payment_status === 'paid') {
        await query(
          `UPDATE report_purchases SET status='completed' WHERE stripe_session_id=$1 AND status='pending'`,
          [obj.id]
        )
        console.log(`Single report paid: folio=${folio} user=${user_id}`)
      }

      if (type === 'overage' && obj.payment_status === 'paid') {
        const r = await query(
          `UPDATE overage_purchases SET status='completed' WHERE stripe_session_id=$1 AND status='pending' RETURNING amount`,
          [obj.id]
        )
        if (r.rows.length) {
          await query(
            `INSERT INTO report_purchases (user_id, folio, amount, stripe_session_id, status, source)
             VALUES ($1,$2,$3,$4,'completed','overage')`,
            [user_id, folio, r.rows[0].amount, obj.id]
          )
        }
        console.log(`Overage report paid: folio=${folio} user=${user_id}`)
      }

      if (type === 'membership' && obj.subscription) {
        await syncSubscription(obj.subscription, user_id)
      }
    }

    /* Initial payment and every renewal */
    if (event.type === 'invoice.paid') {
      const subId = obj.subscription || obj.parent?.subscription_details?.subscription
      if (subId) await syncSubscription(typeof subId === 'string' ? subId : subId.id)
    }

    /* Plan changes and cancel-at-period-end from the billing portal */
    if (event.type === 'customer.subscription.updated') {
      await syncSubscription(obj.id)
    }

    if (event.type === 'customer.subscription.deleted') {
      const r = await query(
        `UPDATE subscriptions SET status='canceled', updated_at=NOW() WHERE stripe_subscription_id=$1 RETURNING user_id`,
        [obj.id]
      )
      const userId = r.rows[0]?.user_id || obj.metadata?.user_id
      if (userId) await query(`UPDATE users SET plan='free', updated_at=NOW() WHERE id=$1`, [userId])
      console.log(`Membership canceled: user=${userId}`)
    }

    if (event.type === 'invoice.payment_failed') {
      await query(
        `UPDATE subscriptions SET status='past_due', updated_at=NOW()
         WHERE user_id=(SELECT id FROM users WHERE stripe_customer_id=$1)`,
        [obj.customer]
      )
      console.log('Payment failed for customer:', obj.customer)
    }

    res.json({ received: true })
  } catch (e) {
    console.error('Webhook processing error:', e)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

/* ── GET /api/payments/portal — Stripe billing portal (change plan, cancel) ── */
router.get('/portal', requireAuth, async (req, res) => {
  try {
    const u = await query('SELECT stripe_customer_id FROM users WHERE id=$1', [req.user.id])
    const customerId = u.rows[0]?.stripe_customer_id
    if (!customerId) return res.status(404).json({ error: 'No billing account found' })
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${frontend()}/account`,
    })
    res.json({ url: session.url })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Billing portal failed', detail: e.message })
  }
})

module.exports = router
module.exports.PLANS = PLANS
module.exports.SINGLE_REPORT = SINGLE_REPORT
module.exports.alreadyOwned = alreadyOwned
module.exports.normFolio = normFolio
