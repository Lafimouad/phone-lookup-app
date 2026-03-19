Phone Lookup Demo

This project is a starter scaffold for a React frontend + Express backend that demonstrates phone number verification (via SMS) and a placeholder for account lookup by phone number.

High-level:
- `client/` - Vite + React frontend
- `server/` - Express backend with Twilio SMS demo (in-memory codes)

Quick start

1. Create a Twilio account and get `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` (optional for dev).
2. In `server/` copy `.env.example` to `.env` and set values.
3. Install and run server:

```bash
cd phone-lookup-app/server
npm install
npm start
```

4. Install and run client:

```bash
cd phone-lookup-app/client
npm install
npm run dev
```

Notes and limitations

- Many social platforms and gaming services do not provide public APIs to search accounts by phone number due to privacy rules. A true "lookup across services" usually requires each platform's cooperation or enterprise APIs which are restricted.
- This scaffold provides a UI and server-side verification flow; account-lookup is left as a placeholder and should be implemented only with lawful methods and explicit user consent.

Next steps

- Wire real lookup integrations where permitted.
- Persist verification codes securely (not in-memory) and rate-limit requests.
- Add authentication and audit logging for privacy compliance.

AWS Lambda deployment

- A serverless version is provided under `serverless/handler.js` and `serverless/template.yaml`.
- Notes: the demo uses an in-memory Map for verification codes which is NOT suitable for production. Use DynamoDB or another persistent store for verification state, and add rate-limiting and monitoring.

Deploy with AWS SAM (example):

```bash
# from phone-lookup-app/serverless
# sam build
# sam deploy --guided
```

After deployment, update the client API base URL to your API Gateway endpoint (or configure a proxy during dev).
