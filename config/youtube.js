// config/youtube.js
const { google } = require('googleapis');
require("dotenv").config();
async function youtubeFor(user) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost:5000/api/google/oauth2callback"
  );
  if (!user?.google?.refreshToken) {
    throw new Error('YouTuber has not connected Google yet');
  }
  oauth2.setCredentials({ 
    refresh_token: user.google.refreshToken });
    await oauth2.getAccessToken();
  return google.youtube({ version: 'v3', auth: oauth2 });
}

module.exports = { youtubeFor };
