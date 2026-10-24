const { Resend } = require('resend')
const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'Miami Opportunities <noreply@miamiopportunities.com>'

function codeEmail({ firstName, intro, code, footer }) {
  return `
    <div style="font-family: Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 30px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 22px; letter-spacing: 4px; color: #0A3D3A;">MIAMI</div>
        <div style="font-size: 11px; letter-spacing: 3px; color: #C4A46B;">OPPORTUNITIES</div>
      </div>
      <p style="font-size: 14px; color: #1A2828;">Hi ${firstName || 'there'},</p>
      <p style="font-size: 14px; color: #1A2828;">${intro}</p>
      <div style="background: #0A3D3A; color: #D9BC88; font-size: 32px; letter-spacing: 8px; text-align: center; padding: 20px; border-radius: 6px; margin: 20px 0;">
        ${code}
      </div>
      <p style="font-size: 12px; color: #7A8A89;">${footer}</p>
    </div>
  `
}

async function sendVerificationEmail(to, firstName, code) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `${code} is your Miami Opportunities verification code`,
      html: codeEmail({
        firstName,
        intro: 'Your verification code is:',
        code,
        footer: "This code expires in 10 minutes. If you didn't request this, you can ignore this email.",
      }),
    })
    return true
  } catch (e) {
    console.error('Resend error:', e.message)
    return false
  }
}

async function sendPasswordResetEmail(to, firstName, code) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `${code} is your Miami Opportunities password reset code`,
      html: codeEmail({
        firstName,
        intro: 'Use this code to reset your password:',
        code,
        footer: "This code expires in 15 minutes. If you didn't ask to reset your password, ignore this email — your password stays the same.",
      }),
    })
    return true
  } catch (e) {
    console.error('Resend error:', e.message)
    return false
  }
}

const SITE = () => (process.env.FRONTEND_URL || 'https://miamiopportunities.com').replace(/\/$/, '')
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function shell(inner, footer = '') {
  return `
    <div style="font-family: Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px; color: #1A2828;">
      <div style="text-align: center; margin-bottom: 22px;">
        <div style="font-size: 22px; letter-spacing: 4px; color: #0A3D3A;">MIAMI</div>
        <div style="font-size: 11px; letter-spacing: 3px; color: #C4A46B;">OPPORTUNITIES</div>
      </div>
      ${inner}
      <div style="font-size: 11px; color: #8A9696; margin-top: 28px; border-top: 1px solid #E8E4D8; padding-top: 12px; line-height: 1.6;">${footer}</div>
    </div>`
}

/* New in-app message — no contact details are included */
async function sendNewMessageEmail(to, firstName, fromName, listingTitle, preview) {
  try {
    await resend.emails.send({
      from: FROM, to,
      subject: `New message about ${listingTitle}`,
      html: shell(`
        <p style="font-size: 14px;">Hi ${esc(firstName) || 'there'},</p>
        <p style="font-size: 14px;"><strong>${esc(fromName)}</strong> sent you a message on Miami Opportunities about <strong>${esc(listingTitle)}</strong>:</p>
        <div style="background: #F5EDD8; border-radius: 6px; padding: 14px 16px; font-size: 14px; margin: 14px 0;">${esc(preview).slice(0, 400)}</div>
        <p><a href="${SITE()}/messages" style="display: inline-block; background: #0A3D3A; color: #D9BC88; padding: 11px 20px; border-radius: 4px; text-decoration: none; font-size: 13px;">Reply on MO →</a></p>`,
        'For your safety, keep conversations on Miami Opportunities until you are comfortable sharing contact details.'),
    })
    return true
  } catch (e) {
    console.error('Resend error:', e.message)
    return false
  }
}

/* Owner campaigns: sends one email per person (batches of 100), each with its own unsubscribe link */
async function sendCampaignEmails(recipients, subject, bodyText, footerAddress) {
  let sent = 0, failed = 0
  const paragraphs = esc(bodyText).split(/\n{2,}/).map(p => `<p style="font-size: 14px; line-height: 1.6;">${p.replace(/\n/g, '<br>')}</p>`).join('')
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100)
    const emails = chunk.map(r => ({
      from: FROM, to: r.email, subject,
      headers: { 'List-Unsubscribe': `<${r.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      html: shell(`<p style="font-size: 14px;">Hi ${esc(r.firstName) || 'there'},</p>${paragraphs}`,
        `You are receiving this because you have a Miami Opportunities account.<br>${esc(footerAddress)}<br>
         <a href="${r.unsubscribeUrl}" style="color: #8A9696;">Unsubscribe from MO emails</a>`),
    }))
    try {
      const out = await resend.batch.send(emails)
      if (out?.error) throw new Error(out.error.message || 'Batch failed')
      sent += chunk.length
    } catch (e) {
      console.error('Campaign batch failed:', e.message)
      failed += chunk.length
    }
  }
  return { sent, failed }
}

/* Early access alert to the owner/team when a new board post comes in */
async function sendTeamNewPostEmail(post) {
  const { isTeamEmail } = require('./access')
  const to = [...new Set(String(process.env.ADMIN_EMAILS || 'natibalma@gmail.com,natibalmare@gmail.com').split(',').concat(String(process.env.TEAM_EMAILS || '').split(','))
    .map(x => x.trim().toLowerCase()).filter(e => e && isTeamEmail(e)))]
  if (!to.length) return false
  const what = post.type === 'fsbo' ? `FSBO: ${post.address || ''}, ${post.city || ''} ${post.zip || ''} — $${Number(post.price || 0).toLocaleString()}` : `Buyer looking: ${post.target_area || ''} — ${post.budget || ''}`
  try {
    await resend.emails.send({
      from: FROM, to,
      subject: `New ${post.type === 'fsbo' ? 'FSBO listing' : 'buyer request'} — you have 24 hours first`,
      html: shell(`
        <p style="font-size: 14px;">A new post was just submitted on the MO board. It goes public in 24 hours — you and your team can see and contact it now.</p>
        <div style="background: #F5EDD8; border-radius: 6px; padding: 14px 16px; font-size: 14px; margin: 14px 0;"><strong>${esc(what)}</strong><br>${esc(post.message || '').slice(0, 400)}</div>
        <p><a href="${SITE()}/board?post=${post.id}" style="display: inline-block; background: #0A3D3A; color: #D9BC88; padding: 11px 20px; border-radius: 4px; text-decoration: none; font-size: 13px;">Open the post →</a></p>`),
    })
    return true
  } catch (e) {
    console.error('Resend error:', e.message)
    return false
  }
}

module.exports = { sendTeamNewPostEmail, sendVerificationEmail, sendPasswordResetEmail, sendNewMessageEmail, sendCampaignEmails }
