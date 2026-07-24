const router = require('express').Router()
const { query } = require('../db/pool')
const { optionalAuth, requireAuth } = require('../middleware/auth')

/* Check if user has access to a full report */
async function hasAccess(userId, folio) {
  if (!userId) return false
  /* Check membership plan */
  const u = await query('SELECT plan FROM users WHERE id = $1', [userId])
  if (u.rows[0]?.plan === 'gold') return true
  /* Check individual purchase */
  const p = await query(
    `SELECT id FROM report_purchases WHERE user_id=$1 AND folio=$2 AND status='completed'`,
    [userId, folio]
  )
  return p.rows.length > 0
}

async function buildReport(folio) {
  const [prop, owner, tax, mortgage, deeds, liens, foreclosure, permits, violations, comps, valuation, score] = await Promise.all([
    query('SELECT * FROM properties WHERE folio=$1', [folio]),
    query('SELECT * FROM owners WHERE folio=$1 ORDER BY as_of DESC LIMIT 1', [folio]),
    query('SELECT * FROM taxes WHERE folio=$1 ORDER BY tax_year DESC LIMIT 1', [folio]),
    query('SELECT * FROM mortgages WHERE folio=$1 ORDER BY position', [folio]),
    query('SELECT * FROM ownership_history WHERE folio=$1 ORDER BY sale_date DESC LIMIT 10', [folio]),
    query(`SELECT * FROM liens WHERE folio=$1 ORDER BY recording_date DESC`, [folio]),
    query('SELECT * FROM foreclosure_cases WHERE folio=$1 ORDER BY filing_date DESC LIMIT 1', [folio]),
    query(`SELECT * FROM permits WHERE folio=$1 ORDER BY issue_date DESC`, [folio]),
    query(`SELECT * FROM code_violations WHERE folio=$1 ORDER BY date_filed DESC`, [folio]),
    query('SELECT * FROM comps WHERE subject_folio=$1 ORDER BY sold_date DESC LIMIT 5', [folio]),
    query('SELECT * FROM valuations WHERE folio=$1 ORDER BY created_at DESC LIMIT 1', [folio]),
    query('SELECT * FROM opportunity_scores WHERE folio=$1 ORDER BY computed_at DESC LIMIT 1', [folio]),
  ])

  return {
    property:   prop.rows[0] || null,
    owner:      owner.rows[0] || null,
    tax:        tax.rows[0] || null,
    mortgages:  mortgage.rows,
    deeds:      deeds.rows,
    liens:      liens.rows,
    foreclosure: foreclosure.rows[0] || null,
    permits:    permits.rows,
    violations: violations.rows,
    comps:      comps.rows,
    valuation:  valuation.rows[0] || null,
    score:      score.rows[0] || null,
  }
}

/* GET /api/property/:folio — full or free tier based on access */
router.get('/:folio', optionalAuth, async (req, res) => {
  try {
    const { folio } = req.params
    const paid = await hasAccess(req.user?.id, folio)
    const report = await buildReport(folio)

    if (!report.property) return res.status(404).json({ error: 'Property not found' })

    if (!paid) {
      let credits = 0
      if (req.user?.id) {
        const c = await query('SELECT credits FROM users WHERE id=$1', [req.user.id])
        credits = c.rows[0]?.credits ?? 0
      }

      /* Free tier — redact sensitive fields */
      return res.json({
        access: 'free',
        folio,
        credits,
        property:    report.property,
        owner: report.owner ? {
          name:       report.owner.name,
          owner_type: report.owner.owner_type,
          homestead:  report.owner.homestead,
          occupancy:  report.owner.occupancy,
          mailing_address: '🔒 Unlock full report',
          matches_prop: report.owner.matches_prop,
        } : null,
        tax: report.tax ? {
          tax_year:     report.tax.tax_year,
          annual_tax:   report.tax.annual_tax,
          tax_status:   report.tax.tax_status,
          delinquent:   report.tax.delinquent,
        } : null,
        foreclosure: report.foreclosure,  /* foreclosure is always free */
        score:       report.score,
        valuation: report.valuation ? {
          as_is_value:  report.valuation.as_is_value,
          value_low:    report.valuation.value_low,
          value_high:   report.valuation.value_high,
          confidence:   report.valuation.confidence,
        } : null,
        paywall: {
          locked_sections: ['Full owner details', 'Deed history', 'All liens & amounts', 'Mortgage analysis', 'Permit details', 'Code violations', 'Full comps', 'ARV estimate', 'Next steps', 'PDF export'],
          pricing: { report: 25.00, basic: 29.00, pro: 99.00, gold: 250.00 }
        }
      })
    }

    /* Full paid report */
    res.json({ access: 'full', folio, ...report, generated_at: new Date().toISOString() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Report failed', detail: e.message })
  }
})

/* GET /api/property/:folio/free — explicit free tier endpoint */
router.get('/:folio/free', optionalAuth, async (req, res) => {
  req.params.paid = false
  res.redirect(307, `/api/property/${req.params.folio}`)
})

module.exports = router
