// Shared Arkesel (Ghana) SMS sender — same call shape as the local copies in
// exeat.js/clinic.js, extracted here so new features don't duplicate it again.
async function sendSms(phone, message) {
  const apiKey   = process.env.SMS_API_KEY;
  const senderId = process.env.SMS_SENDER_ID || 'SCHOOL';
  if (!apiKey) {
    console.warn('[SMS] SMS_API_KEY not set — SMS not sent. Configure SMS_API_KEY and SMS_SENDER_ID on Render.');
    return false;
  }
  if (!phone) {
    console.warn('[SMS] No phone number — SMS not sent.');
    return false;
  }
  try {
    const url = `https://sms.arkesel.com/sms/api?action=send-sms&api_key=${encodeURIComponent(apiKey)}&to=${encodeURIComponent(phone)}&from=${encodeURIComponent(senderId)}&sms=${encodeURIComponent(message)}`;
    const res  = await fetch(url, { method: 'GET' });
    const body = await res.json().catch(() => ({}));
    if (body.status === 'success' || body.code === '0100') {
      console.log(`[SMS] Sent to ${phone}`);
      return true;
    }
    console.error('[SMS] Arkesel rejected:', JSON.stringify(body));
    return false;
  } catch (err) {
    console.error('[SMS] Request failed:', err.message);
    return false;
  }
}

module.exports = { sendSms };
