require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 4000;

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

let twilioClient;
try {
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    const Twilio = require('twilio');
    twilioClient = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
} catch (err) {
  console.warn('Twilio client not configured:', err.message);
}

// In-memory store for demo verification codes: { phone: { code, expires } }
const verifications = new Map();
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateCode() {
  return (Math.floor(100000 + Math.random() * 900000)).toString();
}

app.post('/api/send-verify', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required' });

  const code = generateCode();
  const expires = Date.now() + CODE_TTL_MS;
  verifications.set(phone, { code, expires });

  const text = `Your verification code is ${code}`;

  if (twilioClient && TWILIO_PHONE_NUMBER) {
    try {
      await twilioClient.messages.create({
        body: text,
        from: TWILIO_PHONE_NUMBER,
        to: phone
      });
      return res.json({ ok: true, message: 'Code sent' });
    } catch (err) {
      console.error('Twilio send error', err.message);
      return res.status(500).json({ error: 'Failed to send SMS' });
    }
  }

  // Dev fallback: return code in response (only for dev/testing)
  console.log(`[DEV] Verification code for ${phone}: ${code}`);
  return res.json({ ok: true, message: 'DEV: code generated', devCode: code });
});

app.post('/api/check-verify', (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: 'phone and code required' });

  const entry = verifications.get(phone);
  if (!entry) return res.status(400).json({ ok: false, error: 'No code sent to this number' });
  if (Date.now() > entry.expires) {
    verifications.delete(phone);
    return res.status(400).json({ ok: false, error: 'Code expired' });
  }
  if (entry.code !== String(code)) return res.status(400).json({ ok: false, error: 'Invalid code' });

  verifications.delete(phone);
  return res.json({ ok: true, message: 'Phone verified' });
});

// Placeholder lookup endpoint - real integrations require platform APIs and legal review
app.get('/api/lookup', (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).json({ error: 'phone query param required' });

  // For privacy and legal reasons, public platforms rarely allow lookup by phone.
  // Return a placeholder to show where integrations would appear.
  return res.json({ ok: true, phone, results: [], note: 'Lookup not implemented: requires per-platform APIs/consent' });
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
