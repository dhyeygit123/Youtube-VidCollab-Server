const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  fileId: { type: String, required: true },
  name: { type: String, required: true },
  link: { type: String, required: true },
  status: { type: String, enum: ['Action Pending', 'Under Review', 'Approved', 'Rejected'], default: 'Action Pending' },
  uploadedBy: { type: String, required: true },
  youtuberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  youtubeId: { type: String },
  approvalToken: { type: String }, // New: Token for approval link
  rejectToken: { type: String },   // New: Token for reject link
  tokenExpires: { type: Date },   // New: Expiration for tokens
}, { timestamps: true });

module.exports = mongoose.model('Video', videoSchema);