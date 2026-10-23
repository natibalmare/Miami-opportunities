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

module.exports = { sendVerificationEmail, sendPasswordResetEmail }
