const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/video');
const teamRoutes = require('./routes/team');
const googleRoutes = require('./routes/googleOAuth'); 
const mongoose = require("mongoose");
const DbConfig = require("./config/db");
const app = express();
require("dotenv").config();

DbConfig();
// Middleware
app.use(cors());
app.use(express.json());
  
app.get('/', (req, res) => {
  res.send('Welcome to the YouTube Collab Platform API 🚀');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/google', googleRoutes); 

// Export the app for Vercel
module.exports = app;