// Sends the one-time sign-in code. Real delivery (Brevo, from
// noreply@carolinataxsale.com) is intentionally not wired up yet - BREVO_API_KEY
// is unset in every environment so far, so this just logs the code to the
// server console. The interface is shaped so swapping in a real Brevo call
// later is a one-function change; nothing else in the OTP flow needs to know
// how the email is actually sent.
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.log(`[otp] would email ${email}: your CarolinaTaxSale.com code is ${code}`)
    return
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'api-key': apiKey,
    },
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
