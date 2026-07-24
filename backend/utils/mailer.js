const { Resend } = require('resend')
const resend = new Resend(process.env.RESEND_API_KEY)

async function sendVerificationEmail(to, firstName, code) {
  try {
    await resend.emails.send({
      from: 'Miami Opportunities <noreply@miamiopportunities.com>',
      to,
      subject: `${code} is your Miami Opportunities verification code`,
      html: `
        <div style="font-family: Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 30px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 22px; letter-spacing: 4px; color: #0A3D3A;">MIAMI</div>
            <div style="font-size: 11px; letter-spacing: 3px; color: #C4A46B;">OPPORTUNITIES</div>
          </div>
          <p style="font-size: 14px; color: #1A2828;">Hi ${firstName},</p>
          <p style="font-size: 14px; color: #1A2828;">Your verification code is:</p>
          <div style="background: #0A3D3A; color: #D9BC88; font-size: 32px; letter-spacing: 8px; text-align: center; padding: 20px; border-radius: 6px; margin: 20px 0;">
            ${code}
          </div>
          <p style="font-size: 12px; color: #7A8A89;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
        </div>
      `
    })
    return true
  } catch (e) {
    console.error('Resend error:', e.message)
    return false
  }
}

module.exports = { sendVerificationEmail }
