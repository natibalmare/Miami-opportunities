# MO | Miami Opportunities — Deployment Guide v2.0

## Architecture Overview
```
DonWeb (DNS only) → mo-miami.com
                         ↓
              Vercel  (frontend React/Vite)
                         ↕ /api/*
              Railway (backend Node.js + PostgreSQL)
                         ↕
              Stripe (payments)
```

## Prerequisites
- GitHub account
- Vercel account (free)
- Railway account (~$5/month for 512MB + PostgreSQL)
- Stripe account
- DonWeb domain pointed to Vercel

---

## STEP 1 — Push to GitHub

```bash
cd /path/to/mo-v2
git init
git add .
git commit -m "MO Miami v2.0 — initial deploy"
gh repo create mo-miami --private --push
```

---

## STEP 2 — Deploy Backend on Railway

1. Go to railway.app → New Project → Deploy from GitHub → select `mo-miami`
2. Set **Root Directory** to `backend`
3. Railway auto-detects NIXPACKS + `railway.toml`
4. Add **PostgreSQL plugin**:
   - Railway dashboard → your project → + Add Service → PostgreSQL
   - Copy the `DATABASE_URL` from the PostgreSQL service Variables tab
5. Set Environment Variables (Variables tab in Railway):

```
PORT=4000
NODE_ENV=production
FRONTEND_URL=https://mo-miami.vercel.app    ← update after Vercel deploy
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
DATABASE_URL=<paste from Railway PostgreSQL plugin>
STRIPE_SECRET_KEY=sk_live_XXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXX         ← add after step 4
STRIPE_PRICE_REPORT=price_XXXX
STRIPE_PRICE_MONTHLY=price_XXXX
STRIPE_PRICE_ANNUAL=price_XXXX
CLERK_ACCOUNT_EMAIL=your@email.com
RESEND_API_KEY=re_XXXX
```

6. Deploy and note your Railway URL: `https://mo-miami-backend.up.railway.app`

---

## STEP 3 — Initialize Database

Once Railway backend is running, connect to your Railway PostgreSQL instance:

```bash
# Using Railway CLI
railway run psql $DATABASE_URL -f backend/db/schema.sql

# Or using psql directly:
psql "postgresql://user:pass@host:5432/railway" -f backend/db/schema.sql
```

This creates all 23 tables and seeds neighborhoods + data sources.

---

## STEP 4 — Set Up Stripe

1. Go to dashboard.stripe.com
2. Create Products:

   **Single Report**
   - Product: "MO Property Intelligence Report"
   - Price: $5.99 one-time
   - Copy Price ID → `STRIPE_PRICE_REPORT`

   **Monthly Membership**
   - Product: "MO Monthly Membership"
   - Price: $29.00/month recurring
   - Copy Price ID → `STRIPE_PRICE_MONTHLY`

   **Annual Membership**
   - Product: "MO Annual Membership"
   - Price: $299.00/year recurring
   - Copy Price ID → `STRIPE_PRICE_ANNUAL`

3. Webhooks:
   - Stripe Dashboard → Developers → Webhooks → Add Endpoint
   - URL: `https://mo-miami-backend.up.railway.app/api/payments/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - Copy Signing Secret → `STRIPE_WEBHOOK_SECRET` in Railway

4. Update Railway env vars with all Price IDs and webhook secret

---

## STEP 5 — Deploy Frontend on Vercel

1. Go to vercel.com → Add New → Project → Import from GitHub
2. Select `mo-miami` repo
3. Set **Root Directory** to `frontend`
4. Framework: Vite
5. Build command: `npm run build`
6. Output directory: `dist`
7. Environment Variables:
```
VITE_API_URL=https://mo-miami-backend.up.railway.app
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_XXXX
```
8. Deploy → copy your Vercel URL

---

## STEP 6 — Connect Domain (DonWeb)

DonWeb is your registrar ONLY. Do NOT deploy the app to DonWeb hosting.

1. In Vercel: Settings → Domains → Add `mo-miami.com`
2. Vercel shows you DNS records to set:
   ```
   Type: A      Name: @        Value: 76.76.21.21
   Type: CNAME  Name: www      Value: cname.vercel-dns.com
   ```
3. In DonWeb: DNS Management → Add these two records
4. SSL is automatic via Vercel (Let's Encrypt)

---

## STEP 7 — Update Backend FRONTEND_URL

After Vercel deploys, go back to Railway:
- Variables → `FRONTEND_URL` → update to your actual domain: `https://mo-miami.com`
- This ensures Stripe redirects and CORS work correctly

---

## STEP 8 — Miami-Dade Clerk Account (Priority)

This is your most important integration:

1. Go to: https://onlineservices.miamidadeclerk.gov/officialrecords
2. Create a registered account
3. Purchase search units: minimum $50 (50 units @ $1 each)
4. Store account credentials encrypted in Railway env vars:
   ```
   CLERK_ACCOUNT_EMAIL=your@email.com
   CLERK_ACCOUNT_PASSWORD=your_password
   ```
5. Each backend search of Official Records deducts 1 unit
6. Budget: ~$3-5 per full report (3-5 searches)

---

## STEP 9 — MLS / iMapp Integration

⚠ These credentials MUST stay on the backend only. Never in the frontend.

```
MLS_USERNAME=your_mls_login
MLS_PASSWORD=your_mls_password
MLS_ENDPOINT=https://your-rets-endpoint.com
IMAPP_USERNAME=your_imapp_login
IMAPP_PASSWORD=your_imapp_password
```

Requires: Written broker authorization to query MLS data programmatically.
Contact Miami Realtors MLS department for RETS access credentials.

---

## STEP 10 — Verify Everything

```bash
# Health check
curl https://mo-miami-backend.up.railway.app/api/health
# Expected: {"status":"ok","version":"2.0.0","env":"production"}

# Frontend
open https://mo-miami.com
# Should load MO search page

# Test auth
curl -X POST https://mo-miami-backend.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test1234","firstName":"Test","lastName":"User"}'
# Expected: {"user":{...},"token":"..."}
```

---

## Ongoing Operations

### Cost breakdown (monthly):
- Railway (backend + PostgreSQL 512MB): ~$5
- Vercel (frontend): Free
- Stripe: 2.9% + 30¢ per card transaction (no monthly fee)
- Clerk search units: ~$1/search (budget $50-100/mo to start)
- Skip trace (BatchSkipTracing): ~$0.15-0.25/record
- Google Maps API: First $200/month free

### Monitoring:
- Railway: built-in metrics, logs, auto-restart on failure
- Vercel: Analytics tab (free tier)
- Stripe: Dashboard shows all transactions

### Backups:
- Railway PostgreSQL: automatic daily backups (paid plans)
- Export manually: `pg_dump $DATABASE_URL > backup.sql`

---

## SunBiz Lookup (Immediate — Free)

For LLC-owned properties, the registered agent lookup at SunBiz is always free:
https://search.sunbiz.org

Search the EXACT LLC name from the property record, not the address.
The registered agent's name and address are publicly required by Florida law.

For 332 NW 35th St specifically: Search "332 New Latest House Project LLC"
(NOT "332 NW 47 ST LLC" — that's a different company that was returned in error)

---

## Data Source Integration Roadmap

| Source | Priority | Action Required |
|--------|----------|----------------|
| Miami-Dade Clerk Official Records | 🔴 NOW | Create account, buy $50 units |
| realforeclose.com | ✅ Live links | No action — links work |
| SunBiz | ✅ Free | No action — links work |
| MDPA (Property Appraiser) | 🟡 Next | Test public REST API |
| Miami-Dade Tax Collector | 🟡 Next | Test public portal scraper |
| Miami-Dade Civil Courts | 🟡 Next | Register for advanced access |
| MLS / iMapp | 🟠 Broker needed | Get broker written authorization |
| City of Miami Permits | 🟠 Pending | Test API availability |
| BatchSkipTracing | 🟠 Budget | Create account, test |
| Google Maps | 🔵 Optional | Add API key to Vercel env |
| PACER (federal bankruptcy) | 🔵 Optional | Create PACER account |

---

## Legal Notice

MO is a pre-offer property intelligence platform. It uses legally accessible
public records and authorized data sources only.

Every report must include this disclosure:
"This report uses legally accessible public records only. Data is for lawful
real estate research. This is not a title commitment, legal opinion, or appraisal.
Consult a licensed Florida real estate attorney and title company before any offer."

Never use MO data to harass, pressure, or misrepresent anything to property owners.
