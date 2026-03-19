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

// Stateless verification using HMAC-signed tokens (no database)
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

function base64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString();
}

function signPayload(payloadObj, secret) {
  const payload = base64urlEncode(JSON.stringify(payloadObj));
  const crypto = require('crypto');
  const h = crypto.createHmac('sha256', secret || '');
  h.update(payload);
  const sig = h.digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token, secret) {
  try {
    const crypto = require('crypto');
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    const h = crypto.createHmac('sha256', secret || '');
    h.update(payloadB64);
    const expected = h.digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const payloadJson = base64urlDecode(payloadB64);
    return JSON.parse(payloadJson);
  } catch (err) {
    return null;
  }
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
  const expiresAt = Date.now() + CODE_TTL_MS;

  // Create a signed token containing phone, code and expires
  const secret = process.env.VERIFY_SECRET || '';
  const payload = { phone, code, expiresAt };
  const token = signPayload(payload, secret);

  const text = `Your verification code is ${code}`;

  if (twilioClient && TWILIO_PHONE_NUMBER) {
    try {
      await twilioClient.messages.create({ body: text, from: TWILIO_PHONE_NUMBER, to: phone });
      // Return token to client (client stores it temporarily to present at verification)
      return jsonResponse(200, { ok: true, message: 'Code sent', token });
    } catch (err) {
      console.error('Twilio send error', err.message);
      return jsonResponse(500, { error: 'Failed to send SMS' });
    }
  }

  // Dev fallback: return code and token in response (only for dev/testing)
  console.log(`[DEV] Verification code for ${phone}: ${code}`);
  return jsonResponse(200, { ok: true, message: 'DEV: code generated', devCode: code, token });
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
  // Expect client to provide the signed token so we can validate statelessly
  const token = body.token;
  if (!token) return jsonResponse(400, { ok: false, error: 'token required' });

  const secret = process.env.VERIFY_SECRET || '';
  const payload = verifyToken(token, secret);
  if (!payload) return jsonResponse(400, { ok: false, error: 'Invalid or tampered token' });
  if (payload.phone !== phone) return jsonResponse(400, { ok: false, error: 'Phone mismatch' });
  if (Date.now() > payload.expiresAt) return jsonResponse(400, { ok: false, error: 'Code expired' });
  if (String(payload.code) !== String(code)) return jsonResponse(400, { ok: false, error: 'Invalid code' });

  return jsonResponse(200, { ok: true, message: 'Phone verified' });
};

exports.lookup = async (event) => {
  const phone = (event.queryStringParameters && event.queryStringParameters.phone) || null;
  if (!phone) return jsonResponse(400, { error: 'phone query param required' });

  // Placeholder - real lookups require per-platform APIs and explicit consent
  return jsonResponse(200, { ok: true, phone, results: [], note: 'Lookup not implemented: requires per-platform APIs/consent' });
};
