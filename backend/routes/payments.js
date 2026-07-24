const router = require('express').Router()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' })
const { query, pool } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')

const REPORT_PRICE = { envKey: 'STRIPE_PRICE_REPORT', amount: 25.00 }

const MEMBERSHIP_PLANS = {
  basic: { envKey: 'STRIPE_PRICE_BASIC', amount: 29.00, credits: 10 },
  pro:   { envKey: 'STRIPE_PRICE_PRO',   amount: 99.00, credits: 50 },
  gold:  { envKey: 'STRIPE_PRICE_GOLD',  amount: 250.00, credits: null }, // null = unlimited, no credit tracking
}

async function getOrCreateCustomer(userId) {
  const u = await query('SELECT * FROM users WHERE id=$1', [userId])
  const user = u.rows[0]
  if (!user) throw new Error('User not found')
  if (user.stripe_customer_id) return user.stripe_customer_id

  const cust = await stripe.customers.create({
    email: user.email,
    name: `${user.first_name} ${user.last_name}`,
    metadata: { user_id: userId }
  })
  await query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [cust.id, userId])
  return cust.id
}

/* GET /api/payments/balance — current credits + plan */
router.get('/balance', requireAuth, async (req, res) => {
  try {
    const r = await query('SELECT credits, plan FROM users WHERE id=$1', [req.user.id])
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' })
    res.json({ credits: r.rows[0].credits, plan: r.rows[0].plan })
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch balance' })
  }
})

/* POST /api/payments/checkout — single report, $25 one-time */
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { folio } = req.body
    if (!folio) return res.status(400).json({ error: 'Folio required' })

    const customerId = await getOrCreateCustomer(req.user.id)

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{ price: process.env[REPORT_PRICE.envKey], quantity: 1 }],
      metadata: { folio, user_id: req.user.id, type: 'report_single' },
      success_url: `${process.env.FRONTEND_URL}/report?q=${encodeURIComponent(folio)}&paid=true`,
      cancel_url:  `${process.env.FRONTEND_URL}/report?q=${encodeURIComponent(folio)}&canceled=true`,
      payment_intent_data: { metadata: { folio, user_id: req.user.id } }
    })

    await query(
      `INSERT INTO report_purchases (user_id, folio, amount, stripe_session_id, status, source)
       VALUES ($1,$2,$3,$4,'pending','stripe')`,
      [req.user.id, folio, REPORT_PRICE.amount, session.id]
    )

    res.json({ url: session.url, session_id: session.id })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Checkout failed', detail: e.message })
  }
})

/* POST /api/payments/membership/checkout — { plan: 'basic' | 'pro' | 'gold' } */
router.post('/membership/checkout', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body
    if (!MEMBERSHIP_PLANS[plan])
      return res.status(400).json({ error: 'plan must be basic, pro, or gold' })

    const customerId = await getOrCreateCustomer(req.user.id)
    const { envKey } = MEMBERSHIP_PLANS[plan]

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: process.env[envKey], quantity: 1 }],
      metadata: { user_id: req.user.id, type: 'membership', plan },
      success_url: `${process.env.FRONTEND_URL}/account?subscribed=${plan}`,
      cancel_url:  `${process.env.FRONTEND_URL}/pricing?canceled=true`,
      subscription_data: { metadata: { user_id: req.user.id, type: 'membership', plan } }
    })

    res.json({ url: session.url })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Subscription failed', detail: e.message })
  }
})

/* POST /api/payments/unlock — spend 1 prepaid credit to unlock a folio */
router.post('/unlock', requireAuth, async (req, res) => {
  const { folio } = req.body
  if (!folio) return res.status(400).json({ error: 'Folio required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const u = await client.query('SELECT credits, plan FROM users WHERE id=$1 FOR UPDATE', [req.user.id])
    const user = u.rows[0]
    if (!user) throw new Error('User not found')

    if (user.plan === 'gold') {
      await client.query('ROLLBACK')
      return res.json({ unlocked: true, via: 'gold', credits: user.credits })
    }

    const existing = await client.query(
      `SELECT id FROM report_purchases WHERE user_id=$1 AND folio=$2 AND status='completed'`,
      [req.user.id, folio]
    )
    if (existing.rows.length) {
      await client.query('ROLLBACK')
      return res.json({ unlocked: true, via: 'already_owned', credits: user.credits })
    }

    if (user.credits < 1) {
      await client.query('ROLLBACK')
      return res.status(402).json({ error: 'No credits available. Buy a report or a membership plan.' })
    }

    await client.query('UPDATE users SET credits = credits - 1 WHERE id=$1', [req.user.id])
    await client.query(
      `INSERT INTO report_purchases (user_id, folio, amount, status, source)
       VALUES ($1,$2,0,'completed','credit')`,
      [req.user.id, folio]
    )

    await client.query('COMMIT')
    res.json({ unlocked: true, via: 'credit', credits: user.credits - 1 })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
    res.status(500).json({ error: 'Unlock failed', detail: e.message })
  } finally {
    client.release()
  }
})

/* POST /api/payments/webhook — Stripe events (raw body, mounted in server.js) */
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature']
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    console.error('Webhook signature failed:', e.message)
    return res.status(400).send(`Webhook Error: ${e.message}`)
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const { type, user_id } = session.metadata || {}

      if (type === 'report_single') {
        const { folio } = session.metadata
        await query(
          `UPDATE report_purchases SET status='completed' WHERE stripe_session_id=$1 AND status='pending'`,
          [session.id]
        )
        console.log(`Report unlocked: folio=${folio} user=${user_id}`)
      }

      if (type === 'membership') {
        const plan = session.metadata.plan
        await query('UPDATE users SET plan=$1 WHERE id=$2', [plan, user_id])
        await query(
          `INSERT INTO subscriptions (user_id, stripe_subscription_id, plan, stripe_price_id, status)
           VALUES ($1,$2,$3,$4,'active')
           ON CONFLICT (user_id) DO UPDATE
           SET stripe_subscription_id=$2, plan=$3, stripe_price_id=$4, status='active', updated_at=NOW()`,
          [user_id, session.subscription, plan, process.env[MEMBERSHIP_PLANS[plan].envKey]]
        )
        console.log(`Membership started: plan=${plan} user=${user_id}`)
      }
    }

    /* Fires on initial subscription payment AND every renewal — this is where credits actually reset */
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object
      const subId = invoice.subscription
      if (subId) {
        const s = await query('SELECT user_id, plan FROM subscriptions WHERE stripe_subscription_id=$1', [subId])
        if (s.rows.length) {
          const { user_id, plan } = s.rows[0]
          if (plan === 'gold') {
            await query('UPDATE users SET plan=$1 WHERE id=$2', ['gold', user_id])
          } else if (MEMBERSHIP_PLANS[plan]) {
            await query('UPDATE users SET credits=$1, plan=$2 WHERE id=$3', [MEMBERSHIP_PLANS[plan].credits, plan, user_id])
          }
          await query(`UPDATE subscriptions SET status='active', updated_at=NOW() WHERE stripe_subscription_id=$1`, [subId])
          console.log(`Membership renewed: plan=${plan} user=${user_id}`)
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      const userId = sub.metadata?.user_id
      if (userId) {
        await query('UPDATE users SET plan=$1 WHERE id=$2', ['free', userId])
        await query(
          `UPDATE subscriptions SET status='canceled', updated_at=NOW() WHERE stripe_subscription_id=$1`,
          [sub.id]
        )
        console.log(`Membership canceled: user=${userId}`)
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object
      await query(
        `UPDATE subscriptions SET status='past_due', updated_at=NOW()
         WHERE user_id=(SELECT id FROM users WHERE stripe_customer_id=$1)`,
        [invoice.customer]
      )
      console.log('Payment failed for customer:', invoice.customer)
    }

    res.json({ received: true })
  } catch (e) {
    console.error('Webhook processing error:', e)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

/* GET /api/payments/portal — Stripe customer billing portal (self-service cancel) */
router.get('/portal', requireAuth, async (req, res) => {
  try {
    const u = await query('SELECT stripe_customer_id FROM users WHERE id=$1', [req.user.id])
    const customerId = u.rows[0]?.stripe_customer_id
    if (!customerId) return res.status(404).json({ error: 'No billing account found' })

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL}/account`
    })
    res.json({ url: session.url })
  } catch (e) {
    res.status(500).json({ error: 'Portal failed' })
  }
})

module.exports = router
