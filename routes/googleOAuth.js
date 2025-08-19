// routes/googleOAuth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
require("dotenv").config();
const router = express.Router();

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload'

];

function newOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://youtube-vidcollab-server.onrender.com/api/google/oauth2callback"
  );
}

// 1) Youtuber clicks “Connect Google” -> get auth URL
router.get('/connect', authMiddleware, async (req, res) => {
  console.log("Auth user:", req.user); // 👈 see what role/token contains
  if (req.user.role !== 'youtuber') {
    return res.status(403).json({ message: 'Only YouTubers can connect Google' });
  }
  
  const oauth2 = newOAuthClient();
  const state = jwt.sign({ userId: req.user.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state
  });
  res.json({ url });
});

console.log("Redirecting user to Google with redirect_uri:", process.env.GOOGLE_REDIRECT_URI);
// 2) Google redirects here after consent
router.get('/oauth2callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code/state');

    const { userId } = jwt.verify(state, process.env.JWT_SECRET);

    const oauth2 = newOAuthClient();
    const { tokens } = await oauth2.getToken(code);
    // refresh_token only comes first time (or with prompt=consent)
    if (!tokens.refresh_token) {
      // Use existing token if we already have it
      const u = await User.findById(userId);
      if (!u?.google?.refreshToken) {
        return res.redirect(`${process.env.FRONTEND_URL}/?message=${encodeURIComponent('No refresh token returned. Remove app access in Google Account and try again.')}&type=error`);
      }
    }

    // Save/merge tokens
    const user = await User.findById(userId);
    user.google = user.google || {};
    if (tokens.refresh_token) {
      user.google.refreshToken = tokens.refresh_token;
    }
    user.google.connectedAt = new Date();

    // Ensure a Drive folder exists for uploads
    oauth2.setCredentials({ refresh_token: user.google.refreshToken });
    const drive = google.drive({ version: 'v3', auth: oauth2 });

    let folderId = user.google.driveFolderId;
    if (!folderId) {
      // Look for an existing folder
      const q = `name = 'VidCollab Uploads' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const { data } = await drive.files.list({ q, fields: 'files(id,name)' });
      if (data.files && data.files.length) {
        folderId = data.files[0].id;
      } else {
        const created = await drive.files.create({
          requestBody: {
            name: 'VidCollab Uploads',
            mimeType: 'application/vnd.google-apps.folder'
          },
          fields: 'id'
        });
        folderId = created.data.id;
      }
      user.google.driveFolderId = folderId;
    }

    await user.save();
    return res.redirect(`${process.env.FRONTEND_URL}/?message=${encodeURIComponent('Google connected successfully')}&type=success`);
  } catch (err) {
    console.error(err);
    return res.redirect(`${process.env.FRONTEND_URL}/?message=${encodeURIComponent('Failed to connect Google')}&type=error`);
  }
});

module.exports = router;
