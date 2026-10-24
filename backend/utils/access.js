// backend/utils/access.js
// Who can do what: plan lookups and role rules shared by the board, messages and admin routes.

const { query } = require('../db/pool')

const ACTIVE = ['active', 'trialing', 'past_due']
/* Plans that include messaging FSBO sellers and buyers who need an agent (for agents) */
const AGENT_MESSAGING_PLANS = ['agent', 'pro', 'business']

const adminEmails = () => String(process.env.ADMIN_EMAILS || 'natibalma@gmail.com,natibalmare@gmail.com').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
const isAdminEmail = (email) => adminEmails().includes(String(email || '').toLowerCase())
/* Team members also see new board posts during the first 24 hours (TEAM_EMAILS on Railway, comma separated) */
const teamEmails = () => [...adminEmails(), ...String(process.env.TEAM_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)]
const isTeamEmail = (email) => teamEmails().includes(String(email || '').toLowerCase())
/* Agent memberships and agent access are paused until the brokerage is set up (AGENTS_ENABLED=on to open) */
const agentsEnabled = () => process.env.AGENTS_ENABLED === 'on'
/* New posts go public after this many hours (team sees them right away) */
const EARLY_ACCESS_HOURS = Number(process.env.BOARD_EARLY_HOURS || 24)
const isPublicYet = (createdAt) => Date.now() - new Date(createdAt).getTime() >= EARLY_ACCESS_HOURS * 3600 * 1000

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
  if (isTeamEmail(user.email)) return { ok: true }
  if (!isPublicYet(listing.created_at)) return { ok: false, reason: 'This post is not public yet.' }
  if (user.role === 'agent' && !agentsEnabled()) return { ok: false, reason: 'Agent access to the board opens soon.' }
  if (user.role === 'agent') {
    if (listing.listing_type === 'fsbo' && !listing.agents_ok) return { ok: false, reason: 'This owner asked not to be contacted by agents.' }
    const plan = await activePlan(user.id)
    if (!AGENT_MESSAGING_PLANS.includes(plan)) {
      return { ok: false, upgrade: true, reason: 'Messaging sellers and buyers is included with the Agent, Pro and Business plans.' }
    }
  }
  return { ok: true }
}

module.exports = { ACTIVE, AGENT_MESSAGING_PLANS, isAdminEmail, isTeamEmail, agentsEnabled, EARLY_ACCESS_HOURS, isPublicYet, activePlan, getUser, canContact }
