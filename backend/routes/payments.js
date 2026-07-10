const router = require('express').Router()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { query } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')

/* POST /api/payments/checkout — single report */
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { folio } = req.body
    if (!folio) return res.status(400).json({ error: 'Folio required' })

    /* Get or create Stripe customer */
    const u = await query('SELECT * FROM users WHERE id=$1', [req.user.id])
    const user = u.rows[0]
    let customerId = user.stripe_customer_id

    if (!customerId) {
      const cust = await stripe.customers.create({
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        metadata: { user_id: req.user.id }
      })
      customerId = cust.id
      await query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [customerId, req.user.id])
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{
        price: process.env.STRIPE_PRICE_REPORT,
        quantity: 1
      }],
      metadata: { folio, user_id: req.user.id, type: 'report' },
      success_url: `${process.env.FRONTEND_URL}/report?q=${encodeURIComponent(folio)}&paid=true`,
      cancel_url:  `${process.env.FRONTEND_URL}/report?q=${encodeURIComponent(folio)}&canceled=true`,
      payment_intent_data: {
        metadata: { folio, user_id: req.user.id }
      }
    })

    /* Create pending purchase record */
    await query(
      `INSERT INTO report_purchases (user_id, folio, amount, stripe_session_id, status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [req.user.id, folio, 5.99, session.id]
    )

    res.json({ url: session.url, session_id: session.id })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Checkout failed', detail: e.message })
  }
})

/* POST /api/payments/subscribe — monthly or annual */
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body
    if (!['monthly', 'annual'].includes(plan))
      return res.status(400).json({ error: 'Plan must be monthly or annual' })

    const u = await query('SELECT * FROM users WHERE id=$1', [req.user.id])
    const user = u.rows[0]
    let customerId = user.stripe_customer_id

    if (!customerId) {
      const cust = await stripe.customers.create({
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        metadata: { user_id: req.user.id }
      })
      customerId = cust.id
      await query('UPDATE users SET stripe_customer_id=$1 WHERE id=$2', [customerId, req.user.id])
    }

    const priceId = plan === 'monthly'
      ? process.env.STRIPE_PRICE_MONTHLY
      : process.env.STRIPE_PRICE_ANNUAL

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: req.user.id, plan, type: 'subscription' },
      success_url: `${process.env.FRONTEND_URL}/account?subscribed=true`,
      cancel_url:  `${process.env.FRONTEND_URL}/account?canceled=true`,
      subscription_data: {
        metadata: { user_id: req.user.id, plan }
      }
    })

    res.json({ url: session.url })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Subscription failed', detail: e.message })
  }
})

/* POST /api/payments/webhook — Stripe events */
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
      const { folio, user_id, type } = session.metadata

      if (type === 'report') {
        await query(
          `UPDATE report_purchases SET status='completed', amount=$1
           WHERE stripe_session_id=$2`,
          [5.99, session.id]
        )
        console.log(`Report unlocked: folio=${folio} user=${user_id}`)
      }

      if (type === 'subscription') {
        const plan = session.metadata.plan
        await query('UPDATE users SET plan=$1 WHERE id=$2', ['member', user_id])
        await query(
          `INSERT INTO subscriptions (user_id, stripe_subscription_id, plan, status)
           VALUES ($1,$2,$3,'active')
           ON CONFLICT (user_id) DO UPDATE
           SET stripe_subscription_id=$2, plan=$3, status='active', updated_at=NOW()`,
          [user_id, session.subscription, plan]
        )
        console.log(`Subscription activated: plan=${plan} user=${user_id}`)
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      const userId = sub.metadata.user_id
      if (userId) {
        await query('UPDATE users SET plan=$1 WHERE id=$2', ['free', userId])
        await query(
          `UPDATE subscriptions SET status='canceled', updated_at=NOW()
           WHERE stripe_subscription_id=$1`,
          [sub.id]
        )
        console.log(`Subscription canceled: user=${userId}`)
      }
    }

    if (event.type === 'invoice.payment_failed') {
      console.log('Payment failed:', event.data.object.customer)
    }

    res.json({ received: true })
  } catch (e) {
    console.error('Webhook processing error:', e)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

/* GET /api/payments/portal — Stripe customer portal */
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
