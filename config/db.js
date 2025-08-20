const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Check if already connected to avoid multiple connections
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB already connected');
      return;
    }

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    // Avoid process.exit in serverless; let the function fail and retry
    throw error; // Throw error to be caught by the caller
  }
};

module.exports = connectDB;