const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/video');
const teamRoutes = require('./routes/team');
const googleRoutes = require('./routes/googleOAuth'); 
const mongoose = require("mongoose");
const DbConfig = require("./config/db");
const serverless = require('serverless-http');
require("dotenv").config();

const app = express();

// Connect DB
DbConfig();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/google', googleRoutes);

// Home route
app.get('/', (req, res) => {
  res.send('Welcome to the YouTube Collab Platform API 🚀');
});

// ❌ REMOVE app.listen
// app.listen(PORT, ...)

// ✅ Export as serverless function
module.exports = app;
module.exports.handler = serverless(app);
