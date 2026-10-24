// backend/utils/access.js
// Who can do what: plan lookups and role rules shared by the board, messages and admin routes.

const { query } = require('../db/pool')

const ACTIVE = ['active', 'trialing', 'past_due']
/* Plans that include messaging FSBO sellers and buyers who need an agent (for agents) */
const AGENT_MESSAGING_PLANS = ['agent', 'pro', 'business']

const adminEmails = () => String(process.env.ADMIN_EMAILS || 'natibalma@gmail.com').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
const isAdminEmail = (email) => adminEmails().includes(String(email || '').toLowerCase())

async function activePlan(userId) {
  if (!userId) return 'free'
  const r = await query('SELECT plan, status FROM subscriptions WHERE user_id=$1', [userId])
  const s = r.rows[0]
  return s && ACTIVE.includes(s.status) && s.plan ? s.plan : 'free'
}

async function getUser(userId) {
  const r = await query('SELECT id, email, first_name, last_name, role, email_opt_out FROM users WHERE id=$1', [userId])
  return r.rows[0] || null
}

/* Can this user start a conversation on this listing? Returns { ok, reason, upgrade } */
async function canContact(user, listing) {
  if (!user) return { ok: false, reason: 'Sign in to send a message.' }
  if (listing.user_id === user.id) return { ok: false, reason: 'This is your own post.' }
  if (listing.status !== 'active') return { ok: false, reason: 'This post is no longer active.' }
  if (isAdminEmail(user.email)) return { ok: true }
  if (user.role === 'agent') {
    if (listing.listing_type === 'fsbo' && !listing.agents_ok) return { ok: false, reason: 'This owner asked not to be contacted by agents.' }
    const plan = await activePlan(user.id)
    if (!AGENT_MESSAGING_PLANS.includes(plan)) {
      return { ok: false, upgrade: true, reason: 'Messaging sellers and buyers is included with the Agent, Pro and Business plans.' }
    }
  }
  return { ok: true }
}

module.exports = { ACTIVE, AGENT_MESSAGING_PLANS, isAdminEmail, activePlan, getUser, canContact }
