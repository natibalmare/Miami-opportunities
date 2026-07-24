-- ═══════════════════════════════════════════════════════════════════════════
-- MO | Miami Opportunities — Complete Database Schema v2.0
-- Deploy: Run this file against your Railway PostgreSQL instance
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email               TEXT UNIQUE NOT NULL,
  password            TEXT NOT NULL,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  phone               TEXT,
  role                TEXT DEFAULT 'buyer',
  needs_agent         BOOLEAN DEFAULT true,
  plan                TEXT DEFAULT 'free',
  stripe_customer_id  TEXT,
  email_verified      BOOLEAN DEFAULT false,
  email_verify_code   TEXT,
  email_verify_expires TIMESTAMPTZ,
  phone_verified      BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── PROPERTIES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio             TEXT UNIQUE NOT NULL,
  address           TEXT NOT NULL,
  address_norm      TEXT,
  city              TEXT,
  state             TEXT DEFAULT 'FL',
  zip               TEXT,
  neighborhood      TEXT,
  county            TEXT DEFAULT 'Miami-Dade',
  property_type     TEXT,
  subdivision       TEXT,
  year_built        INT,
  effective_year    INT,
  beds              INT,
  baths             NUMERIC,
  living_area       INT,
  lot_size          INT,
  construction      TEXT,
  stories           INT,
  units             INT,
  flood_zone        TEXT,
  zoning            TEXT,
  opportunity_score INT,
  financeability    TEXT,
  latitude          NUMERIC,
  longitude         NUMERIC,
  raw_data          JSONB,
  last_fetched      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_props_folio     ON properties(folio);
CREATE INDEX IF NOT EXISTS idx_props_address   ON properties(address_norm);
CREATE INDEX IF NOT EXISTS idx_props_zip       ON properties(zip);
CREATE INDEX IF NOT EXISTS idx_props_nbh       ON properties(neighborhood);

-- ── OWNERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS owners (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID REFERENCES properties(id),
  folio           TEXT,
  name            TEXT,
  owner_type      TEXT,
  mailing_address TEXT,
  matches_prop    BOOLEAN,
  homestead       BOOLEAN DEFAULT false,
  occupancy       TEXT,
  llc_state       TEXT,
  sunbiz_id       TEXT,
  as_of           TIMESTAMPTZ DEFAULT NOW()
);

-- ── OWNERSHIP HISTORY ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ownership_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio           TEXT,
  sale_date       DATE,
  grantor         TEXT,
  grantee         TEXT,
  deed_type       TEXT,
  sale_amount     NUMERIC,
  instrument_no   TEXT,
  book            INT,
  page            INT,
  recorded_at     DATE
);

-- ── MORTGAGES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mortgages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio           TEXT,
  position        INT,
  amount          NUMERIC,
  lender          TEXT,
  recording_date  DATE,
  term_months     INT,
  doc_type        TEXT,
  maturity_date   DATE,
  est_balance     NUMERIC,
  satisfied       BOOLEAN DEFAULT false,
  assignments     INT DEFAULT 0,
  instrument_no   TEXT
);

-- ── DEEDS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deeds (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio           TEXT,
  deed_type       TEXT,
  recording_date  DATE,
  grantor         TEXT,
  grantee         TEXT,
  amount          NUMERIC,
  book            INT,
  page            INT,
  instrument_no   TEXT
);

-- ── TAXES ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taxes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio               TEXT,
  tax_year            INT,
  annual_tax          NUMERIC,
  assessed_value      NUMERIC,
  assessed_land       NUMERIC,
  assessed_improve    NUMERIC,
  market_value        NUMERIC,
  tax_status          TEXT,
  delinquent          BOOLEAN DEFAULT false,
  prior_yr_delinquent BOOLEAN DEFAULT false,
  amount_due          NUMERIC,
  source_url          TEXT,
  fetched_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── TAX CERTIFICATES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_certificates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio           TEXT,
  cert_number     TEXT,
  year            INT,
  amount          NUMERIC,
  holder          TEXT,
  status          TEXT,
  issued_date     DATE
);

-- ── TAX DEEDS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_deeds (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio           TEXT,
  application_date DATE,
  auction_date     DATE,
  status          TEXT
);

-- ── LIENS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio           TEXT,
  lien_type       TEXT,
  creditor        TEXT,
  amount          NUMERIC,
  recording_date  DATE,
  status          TEXT DEFAULT 'open',
  instrument_no   TEXT,
  book            INT,
  page            INT,
  source_doc_url  TEXT,
  released_date   DATE,
  satisfaction_no TEXT
);

CREATE INDEX IF NOT EXISTS idx_liens_folio ON liens(folio);

-- ── COURT CASES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS court_cases (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio           TEXT,
  owner_name      TEXT,
  case_number     TEXT,
  case_type       TEXT,
  filing_date     DATE,
  plaintiff       TEXT,
  defendant       TEXT,
  status          TEXT,
  judge           TEXT,
  last_docket     DATE,
  notes           TEXT
);

-- ── FORECLOSURE CASES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS foreclosure_cases (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio           TEXT,
  case_no         TEXT,
  filing_date     DATE,
  plaintiff       TEXT,
  defendant       TEXT,
  status          TEXT,
  final_judgment  NUMERIC,
  judgment_date   DATE,
  auction_date    DATE,
  auction_url     TEXT,
  opening_bid     NUMERIC,
  auction_status  TEXT,
  urgency         TEXT DEFAULT 'low',
  recommendation  TEXT
);

-- ── PERMITS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio           TEXT,
  permit_type     TEXT,
  permit_number   TEXT,
  status          TEXT,
  issue_date      DATE,
  description     TEXT,
  contractor      TEXT,
  fha_flag        BOOLEAN DEFAULT false,
  source          TEXT
);

-- ── CODE VIOLATIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS code_violations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio           TEXT,
  case_number     TEXT,
  violation_type  TEXT,
  status          TEXT,
  date_filed      DATE,
  fine_amount     NUMERIC,
  lien_amount     NUMERIC,
  is_open_lien    BOOLEAN DEFAULT false
);

-- ── COMPS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comps (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_folio   TEXT,
  comp_address    TEXT,
  sold_date       DATE,
  sold_price      NUMERIC,
  sqft            INT,
  price_sqft      NUMERIC,
  beds            INT,
  baths           NUMERIC,
  property_type   TEXT,
  distance_miles  NUMERIC,
  adjusted_price  NUMERIC,
  source          TEXT
);

-- ── VALUATIONS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS valuations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio           TEXT,
  as_is_value     NUMERIC,
  arv_estimate    NUMERIC,
  value_low       NUMERIC,
  value_high      NUMERIC,
  price_sqft      NUMERIC,
  confidence      INT,
  method          TEXT,
  source          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── OPPORTUNITY SCORES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opportunity_scores (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  folio             TEXT,
  score             INT,
  financeability    TEXT,
  factors           JSONB,
  computed_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── LEADS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  folio           TEXT,
  address         TEXT,
  status          TEXT DEFAULT 'new',
  tags            TEXT[],
  notes           JSONB DEFAULT '[]',
  contact_attempts JSONB DEFAULT '[]',
  reminder_date   DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);

-- ── NOTES ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id         UUID REFERENCES leads(id) ON DELETE CASCADE,
  user_id         UUID,
  text            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONTACT ATTEMPTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_attempts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id         UUID REFERENCES leads(id) ON DELETE CASCADE,
  type            TEXT,
  date            DATE DEFAULT CURRENT_DATE,
  note            TEXT,
  outcome         TEXT
);

-- ── UPLOADED PHOTOS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploaded_photos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id         UUID REFERENCES leads(id) ON DELETE CASCADE,
  url             TEXT,
  caption         TEXT,
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── REPORT PURCHASES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_purchases (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES users(id),
  folio             TEXT NOT NULL,
  amount            NUMERIC,
  stripe_session_id TEXT,
  status            TEXT DEFAULT 'pending',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID REFERENCES users(id) UNIQUE,
  stripe_subscription_id  TEXT,
  plan                    TEXT,
  status                  TEXT,
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── SAVED SEARCHES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_searches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id),
  query           TEXT,
  search_type     TEXT,
  filters         JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── NEIGHBORHOODS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS neighborhoods (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT UNIQUE NOT NULL,
  county          TEXT DEFAULT 'Miami-Dade',
  active          BOOLEAN DEFAULT true,
  created_by      UUID
);

-- ── DATA SOURCES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_sources (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT UNIQUE NOT NULL,
  source_url      TEXT,
  api_type        TEXT,
  status          TEXT DEFAULT 'pending',
  last_tested     TIMESTAMPTZ,
  confidence      INT,
  config          JSONB,
  error_message   TEXT
);

-- ── AUDIT LOGS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID,
  action          TEXT,
  resource        TEXT,
  resource_id     TEXT,
  ip              TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── BOARD LISTINGS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_listings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id),
  role            TEXT,
  has_agent       BOOLEAN DEFAULT false,
  target_area     TEXT,
  budget          TEXT,
  message         TEXT,
  show_phone      BOOLEAN DEFAULT true,
  show_email      BOOLEAN DEFAULT true,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── SEED DEFAULT NEIGHBORHOODS ────────────────────────────────────────────────
INSERT INTO neighborhoods (name) VALUES
  ('Morningside'), ('Belle Meade'), ('El Portal'), ('Miami Shores'),
  ('Upper East Side'), ('MiMo District'), ('Shorecrest'), ('Bayside'),
  ('North Miami'), ('North Miami Beach'), ('Hollywood'),
  ('Dania Beach'), ('Hallandale Beach'), ('Northern Blvd'), ('Wynwood')
ON CONFLICT (name) DO NOTHING;

-- ── SEED DATA SOURCES ─────────────────────────────────────────────────────────
INSERT INTO data_sources (name, source_url, api_type, status, confidence) VALUES
  ('Miami-Dade Property Appraiser', 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/26', 'ArcGIS REST', 'live-link', 90),
  ('Miami-Dade Tax Collector', 'https://miamidade.county-taxes.com', 'Portal', 'pending', 0),
  ('Clerk Official Records', 'https://onlineservices.miamidadeclerk.gov/officialrecords', 'Paid Search', 'pending', 0),
  ('Civil / Probate Courts', 'https://www.miamidadeclerk.gov/clerk/civil-court.page', 'Portal', 'pending', 0),
  ('Foreclosure Auctions', 'https://miamidade.realforeclose.com', 'Live Link', 'live-link', 95),
  ('Foreclosure Registry', 'https://bldgappl.miamidade.gov/foreclosureregistry', 'Portal', 'live-link', 85),
  ('Florida SunBiz', 'https://search.sunbiz.org', 'Portal', 'live-link', 90),
  ('City of Miami Permits', 'https://www.miamigov.com/epermit', 'Portal', 'pending', 0),
  ('MLS / Miami Realtors', NULL, 'RETS/IDX', 'auth-required', 0),
  ('iMapp', 'https://www.imapp.com', 'Subscription', 'auth-required', 0),
  ('BatchSkipTracing', 'https://www.batchskiptracing.com', 'REST API', 'pending', 0),
  ('Google Maps', 'https://maps.googleapis.com', 'REST API', 'pending', 0)
ON CONFLICT (name) DO NOTHING;
