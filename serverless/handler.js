const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

let twilioClient;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  try {
    const Twilio = require('twilio');
    twilioClient = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.warn('Twilio client not configured in Lambda:', err.message);
  }
}

// Note: Lambda's execution environment may be reused, but do not rely on in-memory storage for production.
const verifications = new Map();
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateCode() {
  return (Math.floor(100000 + Math.random() * 900000)).toString();
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(body)
  };
}

exports.sendVerify = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const phone = body.phone;
  if (!phone) return jsonResponse(400, { error: 'phone is required' });

  const code = generateCode();
  const expires = Date.now() + CODE_TTL_MS;
  verifications.set(phone, { code, expires });

  const text = `Your verification code is ${code}`;

  if (twilioClient && TWILIO_PHONE_NUMBER) {
    try {
      await twilioClient.messages.create({ body: text, from: TWILIO_PHONE_NUMBER, to: phone });
      return jsonResponse(200, { ok: true, message: 'Code sent' });
    } catch (err) {
      console.error('Twilio send error', err.message);
      return jsonResponse(500, { error: 'Failed to send SMS' });
    }
  }

  // Dev fallback: return code in response (only for dev/testing)
  console.log(`[DEV] Verification code for ${phone}: ${code}`);
  return jsonResponse(200, { ok: true, message: 'DEV: code generated', devCode: code });
};

exports.checkVerify = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const { phone, code } = body;
  if (!phone || !code) return jsonResponse(400, { error: 'phone and code required' });

  const entry = verifications.get(phone);
  if (!entry) return jsonResponse(400, { ok: false, error: 'No code sent to this number' });
  if (Date.now() > entry.expires) {
    verifications.delete(phone);
    return jsonResponse(400, { ok: false, error: 'Code expired' });
  }
  if (entry.code !== String(code)) return jsonResponse(400, { ok: false, error: 'Invalid code' });

  verifications.delete(phone);
  return jsonResponse(200, { ok: true, message: 'Phone verified' });
};

exports.lookup = async (event) => {
  const phone = (event.queryStringParameters && event.queryStringParameters.phone) || null;
  if (!phone) return jsonResponse(400, { error: 'phone query param required' });

  // Placeholder - real lookups require per-platform APIs and explicit consent
  return jsonResponse(200, { ok: true, phone, results: [], note: 'Lookup not implemented: requires per-platform APIs/consent' });
};
