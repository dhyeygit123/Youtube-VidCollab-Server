const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { driveFor } = require('../config/googleDrive'); // CHANGED
const { youtubeFor } = require('../config/youtube');
const authMiddleware = require('../middleware/auth');
const { sendNotificationEmail } = require('../utils/mail');
const Video = require('../models/Video');
const User = require('../models/User');
const router = express.Router();
const fs = require("fs")
require("dotenv").config();
// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Google Drive API
const drive = google.drive({ version: 'v3', auth: googleAuth });

// Get videos for dashboard (protected)
router.get('/', authMiddleware, async (req, res) => {
  try {
    let videos;
    if (req.user.role === 'youtuber') {
      videos = await Video.find({ youtuberId: req.user.id });
    } else {
      videos = await Video.find({ uploadedBy: req.user.email });
    }
    res.json(videos);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching videos' });
  }
});

router.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const file = req.file;
    const { title, description, youtuberId, editorId } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload directly from memory buffer
    const media = {
      mimeType: file.mimetype,
      body: Buffer.from(file.buffer), // ✅ Works on Vercel
    };

    const fileMetadata = {
      name: `${Date.now()}-${file.originalname}`,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    };

    const driveResponse = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, webViewLink',
    });

    // Save video metadata to DB
    const newVideo = new Video({
      title,
      description,
      fileId: driveResponse.data.id,
      driveLink: driveResponse.data.webViewLink,
      youtuberId,
      editorId,
      status: 'Uploaded',
    });

    await newVideo.save();

    res.json({ success: true, video: newVideo });
  } catch (err) {
    console.error('Error uploading video:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ====================
// 📌 Stream Video Route
// ====================
router.get('/stream/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const range = req.headers.range;

  if (!range) return res.status(400).send('Requires Range header');

  try {
    const video = await Video.findOne({ fileId });
    if (!video) return res.status(404).send('Video not found');

    const driveResponse = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    res.writeHead(206, {
      'Content-Range': `bytes 0-*/*`,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/mp4',
    });

    driveResponse.data.pipe(res);
  } catch (err) {
    console.error('Error streaming video:', err);
    res.status(500).send('Error streaming video');
  }
});


// Approve video (dashboard JSON endpoint)
router.post('/approve-json/:videoId', authMiddleware, async (req, res) => {
  const { videoId } = req.params;

  try {
    const video = await Video.findOne({ fileId: videoId });
    if (!video) return res.status(404).json({ message: 'Video not found' });

    if (video.status === 'Approved') {
      return res.status(200).json({ message: 'Video already approved. No action taken.' });
    }

    // Check if logged-in youtuber owns this video
    const youtuber = await User.findOne({ email: req.user.email });
    if (!youtuber || youtuber._id.toString() !== video.youtuberId.toString()) {
      return res.status(403).json({ message: 'Not authorized to approve this video' });
    }
    
    const drive = await driveFor(youtuber);
    const youtube = await youtubeFor(youtuber);
    // Download from Google Drive
    const fileStream = await drive.files.get(
      { fileId: videoId, alt: 'media' },
      { responseType: 'stream' }
    );

    // Check if the user has a YouTube channel
const channelCheck = await youtube.channels.list({
  mine: true,
  part: 'id'
});

if (!channelCheck.data.items || channelCheck.data.items.length === 0) {
  return res.status(400).json({
    message: 'This Google account does not have a YouTube channel. Please create a channel before uploading.'
  });
}

    // Upload to YouTube
    const youtubeResponse = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: video.name,
          description: 'Uploaded via YouTube Video Platform',
        },
        status: { privacyStatus: 'public' },
      },
      media: { body: fileStream.data },
    });

    // Update existing video entry
    await Video.findOneAndUpdate(
      { fileId: videoId },
      {
        $set: {
          status: 'Approved',
          youtubeId: youtubeResponse.data.id,
          approvalToken: null,
          rejectToken: null,
          tokenExpires: null
        }
      },
      { new: true }
    );

    res.json({ message: 'Video approved and uploaded to YouTube' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error approving video' });
  }
});

// Reject video (dashboard JSON endpoint)
router.post('/reject-json/:videoId', authMiddleware, async (req, res) => {
  const { videoId } = req.params;

  try {
    const video = await Video.findOne({ fileId: videoId });
    if (!video) return res.status(404).json({ message: 'Video not found' });

    const youtuber = await User.findOne({ email: req.user.email });
    if (!youtuber || youtuber._id.toString() !== video.youtuberId.toString()) {
      return res.status(403).json({ message: 'Not authorized to reject this video' });
    }

    // Update status
    await Video.findOneAndUpdate(
      { fileId: videoId },
      {
        $set: {
          status: 'Under Review',
          approvalToken: null,
          rejectToken: null,
          tokenExpires: null
        }
      },
      { new: true }
    );

    res.json({ message: 'Video marked as under review' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error rejecting video' });
  }
});


// Success redirect handler
router.get('/success', (req, res) => {
  res.status(200).json({ message: req.query.message });
});

// Error redirect handler
router.get('/error', (req, res) => {
  res.status(500).json({ message: req.query.message });
});

module.exports = router;