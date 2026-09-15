import 'server-only'

// Sends the one-time sign-in code through Brevo, from noreply@carolinataxsale.com.
// Without BREVO_API_KEY (local development) the code is logged instead.
//
// Brevo accepts a send before it validates the sender, so a 2xx here does not
// prove delivery: when a code never arrives, check Brevo's transactional logs
// (an unverified sender or domain is rejected there, silently to this app).
export async function sendOtpEmail(email: string, code: string, ttlMinutes: number): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.log(`[otp] would email ${email}: your CarolinaTaxSale.com code is ${code}`)
    return
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'api-key': apiKey },
    body: JSON.stringify({
      sender: { email: 'noreply@carolinataxsale.com', name: 'CarolinaTaxSale.com' },
      to: [{ email }],
      subject: `${code} is your CarolinaTaxSale.com sign-in code`,
      htmlContent: renderOtpEmailHtml(code, ttlMinutes),
      textContent: `Your CarolinaTaxSale.com sign-in code is ${code}. It expires in ${ttlMinutes} minutes. Don't share this code with anyone. If you didn't request this, you can ignore this email.`,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Brevo send failed (${res.status}): ${body}`)
  }
}

// Brand colors, as hex because email clients don't support oklch: navy is the
// light-theme --primary, teal the dark-theme --primary (legible on navy) and
// cream the --background from app/globals.css.
const NAVY = '#142741'
const TEAL = '#3bcddc'
const CREAM = '#f7f4ec'
const TEXT = '#1e2a3a'
const MUTED = '#5b6577'
const BORDER = '#e6e0d2'
const FONT = 'Arial, Helvetica, sans-serif'

// Table layout with inline styles only: the lowest common denominator that
// renders consistently in Gmail, Outlook and Apple Mail. No images, so nothing
// depends on the recipient loading remote content.
export function renderOtpEmailHtml(code: string, ttlMinutes: number): string {
  const year = new Date().getFullYear()
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Your CarolinaTaxSale.com sign-in code</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your sign-in code is ${code}. It expires in ${ttlMinutes} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
        <tr>
          <td align="center" style="background-color:${NAVY};padding:22px 24px 20px;border-bottom:4px solid ${TEAL};">
            <div style="font-family:${FONT};font-size:22px;font-weight:bold;letter-spacing:0.2px;color:#ffffff;">Carolina<span style="color:${TEAL};">TaxSale</span>.com</div>
            <div style="font-family:${FONT};font-size:13px;color:#c9d2e0;padding-top:6px;">Your sign-in code</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px;font-family:${FONT};font-size:15px;line-height:22px;color:${TEXT};">
            <p style="margin:0 0 12px;">Hello,</p>
            <p style="margin:0;">Use this one-time code to sign in to your CarolinaTaxSale.com account:</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
              <tr>
                <td align="center" style="padding:20px 12px 20px 20px;font-family:${FONT};font-size:36px;line-height:40px;font-weight:bold;letter-spacing:8px;color:${NAVY};">${code}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 28px;font-family:${FONT};font-size:14px;line-height:21px;color:${TEXT};">
            <p style="margin:0 0 12px;">This code is valid for <strong>${ttlMinutes} minutes</strong>. Please don't share it with anyone. CarolinaTaxSale.com will never ask you for it.</p>
            <p style="margin:0 0 12px;color:${MUTED};">If you didn't request this code, you can safely ignore this email.</p>
            <p style="margin:0;">Thanks for using CarolinaTaxSale.com!</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="background-color:${NAVY};padding:14px 24px;font-family:${FONT};font-size:12px;line-height:18px;color:#c9d2e0;">&copy; ${year} CarolinaTaxSale.com. All rights reserved.</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}
