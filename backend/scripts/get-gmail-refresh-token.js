// backend/scripts/get-gmail-refresh-token.js
//
// One-time helper: run this locally whenever Gmail sending starts failing
// with "invalid_grant" — that error means the current GMAIL_REFRESH_TOKEN
// was revoked or expired (common if the Google Cloud OAuth consent screen is
// still in "Testing" mode, where refresh tokens auto-expire after 7 days).
// This mints a fresh one using the same GMAIL_CLIENT_ID/SECRET and redirect
// URI already used by gmail-draft.service.ts.
//
// Usage:
//   1. Stop your local "npm run start:dev" first (it also uses port 3001).
//   2. cd backend
//   3. node scripts/get-gmail-refresh-token.js
//   4. Open the printed URL, sign in as the Gmail account RarePrint sends
//      from (e.g. purchase.rareprint@gmail.com), and approve access.
//   5. The new refresh token prints in this terminal — copy it into
//      GMAIL_REFRESH_TOKEN on Railway (and backend/.env if you test locally).

require('dotenv/config');
const http = require('http');
const { google } = require('googleapis');

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3001/auth/google/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in backend/.env — add them first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // forces Google to issue a NEW refresh_token even if this account already granted access before
  scope: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
  ],
});

console.log('\nOpen this URL, sign in as the Gmail account RarePrint sends from, and approve access:\n');
console.log(authUrl + '\n');
console.log('Waiting for you to approve access in the browser...\n');

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith('/auth/google/callback')) {
    res.end('Waiting for the Google redirect...');
    return;
  }
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  if (!code) {
    res.end('No authorization code received — check the terminal for details.');
    console.error('No "code" query param on callback:', req.url);
    return;
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (tokens.refresh_token) {
      res.end('Success! Refresh token printed in your terminal — you can close this tab.');
      console.log('\n=== New GMAIL_REFRESH_TOKEN ===\n');
      console.log(tokens.refresh_token);
      console.log('\nCopy that into GMAIL_REFRESH_TOKEN on Railway (and backend/.env if you send locally).\n');
    } else {
      res.end('No refresh token returned — see terminal for how to fix.');
      console.error(
        '\nGoogle did not return a refresh_token. This usually means this account already has an ' +
        'active grant for this app. Revoke it first at https://myaccount.google.com/permissions ' +
        '(find this app under "Third-party apps with account access") then run this script again.\n',
      );
    }
  } catch (err) {
    res.end('Error exchanging the code — check the terminal.');
    console.error(err);
  } finally {
    server.close();
  }
}).listen(3001, () => {});
