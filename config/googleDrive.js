// config/googleDrive.js
const { google } = require('googleapis');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// returns a Drive client AUTHENTICATED AS THE YOUTUBER
async function driveFor(user) {
  const oauth2 = getOAuth2Client();
  if (!user?.google?.refreshToken) {
    throw new Error('YouTuber has not connected Google yet');
  }
  oauth2.setCredentials({ refresh_token: user.google.refreshToken });
  await oauth2.getAccessToken();
  return google.drive({ version: 'v3', auth: oauth2 });
}

module.exports = { getOAuth2Client, driveFor };
