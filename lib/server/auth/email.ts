import 'server-only'

// Sends the one-time sign-in code through Brevo, from noreply@carolinataxsale.com.
// Without BREVO_API_KEY (local development) the code is logged instead.
//
// Brevo accepts a send before it validates the sender, so a 2xx here does not
// prove delivery: when a code never arrives, check Brevo's transactional logs
// (an unverified sender or domain is rejected there, silently to this app).
export async function sendOtpEmail(email: string, code: string): Promise<void> {
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
      textContent: `Your sign-in code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Brevo send failed (${res.status}): ${body}`)
  }
}
