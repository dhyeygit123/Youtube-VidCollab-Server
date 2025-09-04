const express = require('express');
const cors = require('cors');
const authRoutes = require('../routes/auth');
const videoRoutes = require('../routes/video');
const teamRoutes = require('../routes/team');
const googleRoutes = require('../routes/googleOAuth'); 
const mongoose = require("mongoose");
const DbConfig = require("../config/db")
const app = express();
require("dotenv").config();
// const teamRoutes = require('./routes/team');
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
// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;