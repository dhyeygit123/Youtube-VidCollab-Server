// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['youtuber', 'editor'], required: true },
  youtuberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },

  // NEW:
  google: {
    refreshToken: { type: String },
    driveFolderId: { type: String }, // where editor uploads will land
    connectedAt: { type: Date }
  }
});

module.exports = mongoose.model('User', userSchema);
