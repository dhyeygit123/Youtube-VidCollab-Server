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
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => { 
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// Update multer configuration to use memory storage
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory instead of disk
  fileFilter: (req, file, cb) => {
    const filetypes = /mp4|mov|avi/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only video files are allowed!'));
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit (adjust as needed)
  },
});

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

// Modified upload route for Vercel deployment
router.post('/upload', authMiddleware, upload.single('video'), async (req, res) => {
  if (req.user.role !== 'editor') {
    return res.status(403).json({ message: 'Only editors can upload videos' });
  }

  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    // Find the editor and their youtuber
    const editor = await User.findOne({ email: req.user.email });
    if (!editor?.youtuberId) return res.status(400).json({ message: 'Editor not associated with a YouTuber' });

    const youtuber = await User.findById(editor.youtuberId);
    if (!youtuber) return res.status(400).json({ message: 'YouTuber not found' });
    if (!youtuber.google?.refreshToken) {
      return res.status(400).json({ message: 'Channel owner has not connected Google yet' });
    }

    const drive = await driveFor(youtuber);

    // Ensure folder exists
    let parentFolderId = youtuber.google.driveFolderId;
    if (!parentFolderId) {
      const created = await drive.files.create({
        requestBody: { name: 'VidCollab Uploads', mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id'
      });
      parentFolderId = created.data.id;
      youtuber.google.driveFolderId = parentFolderId;
      await youtuber.save();
    }

    const fileMetadata = {
      name: file.originalname, // Use original name instead of generated filename
      parents: [parentFolderId],
    };

    // CHANGE: Use file buffer directly instead of file path
    const media = { 
      mimeType: file.mimetype, 
      body: Buffer.from(file.buffer) // Use buffer instead of createReadStream
    };

    const driveResponse = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name, webViewLink',
    });

    // NO FILE CLEANUP NEEDED - no temporary files created

    // Generate approval/reject tokens
    const approvalToken = crypto.randomBytes(32).toString('hex');
    const rejectToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Rest of your code remains the same...
    const video = new Video({
      fileId: driveResponse.data.id,
      name: driveResponse.data.name,
      link: driveResponse.data.webViewLink,
      status: 'Action Pending',
      uploadedBy: req.user.email,
      youtuberId: youtuber._id,
      approvalToken,
      rejectToken,
      tokenExpires,
    });
    await video.save();

    const reviewUrl = `${process.env.FRONTEND_URL}/?page=approval&fileId=${video.fileId}&approveToken=${approvalToken}&rejectToken=${rejectToken}`;

    await sendNotificationEmail(
      youtuber.email,
      'New Video Uploaded for Review',
      `A new video "${video.name}" has been uploaded for your review.\n\nReview it here: ${reviewUrl}`
    );

    res.status(200).json({
      message: 'Video uploaded and notification sent',
      fileId: video.fileId,
      fileName: video.name,
      fileLink: video.link,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Error uploading video or sending notification' });
  }
});



// Stream video file from Google Drive
router.get('/stream/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const range = req.headers.range;
  if (!range) return res.status(400).send("Requires Range header");

  try {
    const video = await Video.findOne({ fileId });
    if (!video) return res.status(404).send('Video not found');

    const youtuber = await User.findById(video.youtuberId);
    if (!youtuber?.google?.refreshToken) return res.status(400).send('Channel owner not connected');

    const drive = await driveFor(youtuber);

    const fileInfo = await drive.files.get({ fileId, fields: 'size, mimeType' });
    const fileSize = parseInt(fileInfo.data.size, 10);
    const mimeType = fileInfo.data.mimeType || 'video/mp4';

    const CHUNK_SIZE = 10 ** 6;
    const start = Number(range.replace(/\D/g, ""));
    const end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
    const contentLength = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': contentLength,
      'Content-Type': mimeType,
    });

    const driveStream = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream', headers: { Range: `bytes=${start}-${end}` } }
    );

    driveStream.data.pipe(res);
  } catch (error) {
    console.error('Stream error:', error.message);
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

    console.log("Dhyey")

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