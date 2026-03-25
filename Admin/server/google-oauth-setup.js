/**
 * Google Drive OAuth Setup — Run this ONCE to get a refresh token.
 *
 * Steps:
 * 1. Go to Google Cloud Console → APIs & Services → Credentials
 * 2. Create OAuth Client ID → type "Web application"
 * 3. Add "http://localhost:3001/oauth/callback" as a redirect URI
 * 4. Copy the Client ID and Client Secret below
 * 5. Run: node google-oauth-setup.js
 * 6. Open the URL it prints, authorize, and it will give you a refresh token
 * 7. Paste the refresh token into .env as GOOGLE_REFRESH_TOKEN
 */

require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.log('\n❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
  console.log('\nSteps to get these:');
  console.log('1. Go to: https://console.cloud.google.com/apis/credentials');
  console.log('2. Click "Create Credentials" → "OAuth client ID"');
  console.log('3. Application type: "Web application"');
  console.log('4. Name: "SyntriGuard"');
  console.log('5. Add redirect URI: http://localhost:3001/oauth/callback');
  console.log('6. Copy Client ID and Client Secret into .env');
  console.log('7. Run this script again\n');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'http://localhost:3001/oauth/callback'
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file']
});

console.log('\n📎 Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for authorization...\n');

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === '/oauth/callback') {
    const code = parsed.query.code;
    try {
      const { tokens } = await oauth2Client.getToken(code);
      console.log('\n✅ Success! Add this to your .env file:\n');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('\nYou can close this window and stop this script (Ctrl+C).\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>✅ Google Drive connected!</h1><p>You can close this tab. Copy the refresh token from the terminal.</p>');
    } catch (err) {
      console.error('Error:', err.message);
      res.writeHead(500);
      res.end('Error: ' + err.message);
    }
    setTimeout(() => process.exit(0), 2000);
  }
});

server.listen(3001, () => {
  console.log('Listening on http://localhost:3001 for OAuth callback...');
});
