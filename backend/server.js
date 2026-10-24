require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const helmet  = require('helmet')
const morgan  = require('morgan')
const rateLimit = require('express-rate-limit')

const authRoutes      = require('./routes/auth')
const searchRoutes    = require('./routes/search')
const propertyRoutes  = require('./routes/property')
const foreclosureRoutes = require('./routes/foreclosure')
const permitsRoutes   = require('./routes/permits')
const taxRoutes       = require('./routes/tax')
const liensRoutes     = require('./routes/liens')
const paymentsRoutes  = require('./routes/payments')
const leadsRoutes     = require('./routes/leads')
const boardRoutes     = require('./routes/board')
const sourcesRoutes   = require('./routes/sources')
const criteriaRoutes  = require('./routes/criteria')
const marketRoutes    = require('./routes/market')
const mapRoutes       = require('./routes/map')
const messagesRoutes  = require('./routes/messages')
const adminRoutes     = require('./routes/admin')
const ownerRoutes     = require('./routes/owner')
const { ensureSchema } = require('./db/ensureSchema')
const { startDataRefresh } = require('./jobs/dataRefresh')
const { startProbe } = require('./jobs/probe')

const app = express()
/* Railway sits in front of the app — use the visitor's real IP for rate limits */
app.set('trust proxy', 1)

/* ── SECURITY ──────────────────────────────────────────────────────────────── */
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:3000'
    ]
    if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(new URL(origin).hostname) || /miamiopportunities\.com$/.test(new URL(origin).hostname)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))
/* Address suggestions fire while typing, so they get their own, larger allowance */
app.use('/api/search/suggest', rateLimit({ windowMs: 15 * 60 * 1000, max: 600, message: { suggestions: [], error: 'Too many requests. Please wait.' } }))
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  skip: (req) => req.path.startsWith('/api/search/suggest'),
  message: { error: 'Rate limit exceeded. Please wait.' }
}))

/* ── BODY PARSING ──────────────────────────────────────────────────────────── */
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '10mb' }))

/* ── LOGGING ───────────────────────────────────────────────────────────────── */
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'))

/* ── ROUTES ────────────────────────────────────────────────────────────────── */
app.use('/api/auth',        authRoutes)
app.use('/api/search',      searchRoutes)
app.use('/api/criteria',    criteriaRoutes)
app.use('/api/market',      marketRoutes)
app.use('/api/map',         mapRoutes)
app.use('/api/messages',    messagesRoutes)
app.use('/api/admin',       adminRoutes)
app.use('/api/owner',       ownerRoutes)
app.use('/api/property',    propertyRoutes)
app.use('/api/foreclosure', foreclosureRoutes)
app.use('/api/permits',     permitsRoutes)
app.use('/api/tax',         taxRoutes)
app.use('/api/liens',       liensRoutes)
app.use('/api/payments',    paymentsRoutes)
app.use('/api/leads',       leadsRoutes)
app.use('/api/board',       boardRoutes)
app.use('/api/sources',     sourcesRoutes)

/* ── HEALTH CHECK ──────────────────────────────────────────────────────────── */
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '2.0.0', env: process.env.NODE_ENV }))

/* ── 404 / ERROR ───────────────────────────────────────────────────────────── */
app.use((req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 4000
ensureSchema()
  .catch(e => console.error('Schema check error:', e.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`MO Miami backend v2.0 running on :${PORT}`))
    startDataRefresh()
    startProbe()
  })
