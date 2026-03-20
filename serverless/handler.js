const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

let twilioClient = null;
let twilioLoaded = false;
let twilioLoadPromise = null;

async function getTwilioCredsFromSecret() {
  // If explicit env vars are present, prefer them
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    return {
      accountSid: TWILIO_ACCOUNT_SID,
      authToken: TWILIO_AUTH_TOKEN,
      phoneNumber: TWILIO_PHONE_NUMBER,
    };
  }

  const arn = process.env.TWILIO_SECRET_ARN;
  if (!arn) return null;
  if (twilioLoadPromise) return twilioLoadPromise;

  try {
    const AWS = require("aws-sdk");
    const sm = new AWS.SecretsManager();
    twilioLoadPromise = sm
      .getSecretValue({ SecretId: arn })
      .promise()
      .then((res) => {
        const s = res.SecretString || "";
        try {
          const parsed = JSON.parse(s);
          return {
            accountSid:
              parsed.accountSid ||
              parsed.TWILIO_ACCOUNT_SID ||
              parsed.account_sid,
            authToken:
              parsed.authToken || parsed.TWILIO_AUTH_TOKEN || parsed.auth_token,
            phoneNumber:
              parsed.phoneNumber ||
              parsed.TWILIO_PHONE_NUMBER ||
              parsed.phone_number,
          };
        } catch (err) {
          // Secret is not JSON — treat as empty
          return null;
        }
      })
      .catch((err) => {
        console.error(
          "Failed to load Twilio secret from Secrets Manager",
          err && err.message,
        );
        return null;
      });
    return twilioLoadPromise;
  } catch (err) {
    console.warn(
      "aws-sdk not available in Lambda runtime; skipping Twilio secret fetch",
    );
    return null;
  }
}

async function ensureTwilioClient() {
  if (twilioLoaded) return twilioClient;
  const creds = await getTwilioCredsFromSecret();
  if (creds && creds.accountSid && creds.authToken) {
    try {
      const Twilio = require("twilio");
      twilioClient = Twilio(creds.accountSid, creds.authToken);
      // If phone number is present in secret, prefer it
      if (!global.TWILIO_PHONE_NUMBER && creds.phoneNumber) {
        // don't overwrite env var, but make it available
        process.env.TWILIO_PHONE_NUMBER = creds.phoneNumber;
      }
    } catch (err) {
      console.warn("Twilio client load failed:", err && err.message);
      twilioClient = null;
    }
  }
  twilioLoaded = true;
  return twilioClient;
}

// Stateless verification using HMAC-signed tokens (no database)
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
    body: JSON.stringify(body),
  };
}

function base64urlEncode(buf) {
  return Buffer.from(buf).toString("base64url");
}

function base64urlDecode(str) {
  return Buffer.from(str, "base64url").toString();
}

function signPayload(payloadObj, secret) {
  const payload = base64urlEncode(JSON.stringify(payloadObj));
  const crypto = require("crypto");
  const h = crypto.createHmac("sha256", secret || "");
  h.update(payload);
  const sig = h.digest("base64url");
  return `${payload}.${sig}`;
}

function verifyToken(token, secret) {
  try {
    const crypto = require("crypto");
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    const h = crypto.createHmac("sha256", secret || "");
    h.update(payloadB64);
    const expected = h.digest("base64url");
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

// Retrieve VERIFY_SECRET: prefer `VERIFY_SECRET` env var (existing),
// otherwise fetch from Secrets Manager using `VERIFY_SECRET_ARN`.
let cachedSecret = null;
let loadingSecretPromise = null;
async function getVerifySecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.VERIFY_SECRET) {
    cachedSecret = process.env.VERIFY_SECRET;
    return cachedSecret;
  }
  const arn = process.env.VERIFY_SECRET_ARN;
  if (!arn) return "";
  if (loadingSecretPromise) return loadingSecretPromise;
  try {
    const AWS = require("aws-sdk");
    const sm = new AWS.SecretsManager();
    loadingSecretPromise = sm
      .getSecretValue({ SecretId: arn })
      .promise()
      .then((res) => {
        const s = res.SecretString || "";
        cachedSecret = s;
        loadingSecretPromise = null;
        return cachedSecret;
      })
      .catch((err) => {
        console.error(
          "Failed to load secret from Secrets Manager",
          err && err.message,
        );
        loadingSecretPromise = null;
        return "";
      });
    return loadingSecretPromise;
  } catch (err) {
    // If the runtime doesn't provide 'aws-sdk' and bundling excluded it, avoid crashing.
    console.warn(
      "aws-sdk not available in Lambda runtime; skipping secret fetch",
    );
    return "";
  }
  return loadingSecretPromise;
}

exports.sendVerify = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const phone = body.phone;
  if (!phone) return jsonResponse(400, { error: "phone is required" });
  const code = generateCode();
  const expiresAt = Date.now() + CODE_TTL_MS;

  // Create a signed token containing phone, code and expires
  const secret = await getVerifySecret();
  const payload = { phone, code, expiresAt };
  const token = signPayload(payload, secret);

  const text = `Your verification code is ${code}`;

  // Ensure Twilio client is initialized (may load credentials from Secrets Manager)
  await ensureTwilioClient();
  const activeTwilioNumber =
    process.env.TWILIO_PHONE_NUMBER || TWILIO_PHONE_NUMBER;
  if (twilioClient && activeTwilioNumber) {
    try {
      await twilioClient.messages.create({
        body: text,
        from: activeTwilioNumber,
        to: phone,
      });
      // Return token to client (client stores it temporarily to present at verification)
      return jsonResponse(200, { ok: true, message: "Code sent", token });
    } catch (err) {
      console.error("Twilio send error", err.message);
      return jsonResponse(500, { error: "Failed to send SMS" });
    }
  }

  // Dev fallback: return code and token in response (only for dev/testing)
  console.log(`[DEV] Verification code for ${phone}: ${code}`);
  return jsonResponse(200, {
    ok: true,
    message: "DEV: code generated",
    devCode: code,
    token,
  });
};

exports.checkVerify = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const { phone, code } = body;
  if (!phone || !code)
    return jsonResponse(400, { error: "phone and code required" });
  // Expect client to provide the signed token so we can validate statelessly
  const token = body.token;
  if (!token) return jsonResponse(400, { ok: false, error: "token required" });

  const secret = await getVerifySecret();
  const payload = verifyToken(token, secret);
  if (!payload)
    return jsonResponse(400, { ok: false, error: "Invalid or tampered token" });
  if (payload.phone !== phone)
    return jsonResponse(400, { ok: false, error: "Phone mismatch" });
  if (Date.now() > payload.expiresAt)
    return jsonResponse(400, { ok: false, error: "Code expired" });
  if (String(payload.code) !== String(code))
    return jsonResponse(400, { ok: false, error: "Invalid code" });

  return jsonResponse(200, { ok: true, message: "Phone verified" });
};

exports.lookup = async (event) => {
  const phone =
    (event.queryStringParameters && event.queryStringParameters.phone) || null;
  if (!phone) return jsonResponse(400, { error: "phone query param required" });

  // Placeholder - real lookups require per-platform APIs and explicit consent
  return jsonResponse(200, {
    ok: true,
    phone,
    results: [],
    note: "Lookup not implemented: requires per-platform APIs/consent",
  });
};
