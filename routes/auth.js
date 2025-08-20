const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PendingInvite = require("../models/Invite")
const { validateSignup, validateLogin } = require('../middleware/validate');
const router = express.Router();
const { sendNotificationEmail } = require('../utils/mail');
const authMiddleware = require('../middleware/auth');
const Invite = require('../models/Invite');

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Compute googleConnected flag (true if refreshToken exists)
    const googleConnected = !!(user.google && user.google.refreshToken);

    // Remove password
    const { password, ...safeUser } = user;

    res.json({
      ...safeUser,
      googleConnected,   // <--- add this flag
    });
  } catch (err) {
    console.error('Error in /me:', err);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

// Signup route
router.post('/signup', validateSignup, async (req, res) => {
  const { email, password, role, youtuberId } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    if (role === 'editor') {
      const youtuber = await User.findById(youtuberId);
      if (!youtuber || youtuber.role !== 'youtuber') {
        return res.status(400).json({ message: 'Invalid YouTuber ID' });
      }

      // Check if there's already a pending invite for this combination
      const existingPendingInvite = await PendingInvite.findOne({
        email,
        youtuberId,
        status: 'pending'
      });

      if (existingPendingInvite) {
        return res.status(400).json({ 
          message: 'Your signup request is already pending approval from the YouTuber' 
        });
      }

      // Create pending invite instead of direct user creation
      const hashedPassword = await bcrypt.hash(password, 10);
      const pendingInvite = new PendingInvite({
        email,
        password: hashedPassword,
        youtuberId,
        status: 'pending',
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });

      await pendingInvite.save();

      // Notify the YouTuber about the signup request
      const subject = `New Editor Signup Request - ${email}`;
      const emailText = `
Hello,

A new editor has requested to join your team:

Editor Email: ${email}
Request Time: ${new Date().toLocaleString()}

Please log into your dashboard to approve or deny this request.

This request will expire in 7 days if not acted upon.

Best regards,
The Video Editing Platform Team
      `;

      try {
        await sendNotificationEmail(youtuber.email, subject, emailText);
      } catch (emailError) {
        console.error('Failed to send notification email:', emailError);
        // Don't fail the signup if email fails
      }

      return res.status(201).json({ 
        message: 'Signup request submitted successfully. Please wait for the YouTuber to approve your request.',
        pending: true 
      });
    }

    // For YouTuber signup - proceed as normal
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      password: hashedPassword,
      role,
      youtuberId: null,
    });
    await user.save();

    const token = jwt.sign({ email, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(201).json({ token, role });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});



// Login route
router.post('/login', validateLogin, async (req, res) => {
  const { email, password, role, youtuberId } = req.body;

  try {
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(400).json({ message: 'No user found! Please Sign in First' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        message: 'Your account has been deactivated by the channel owner. Please contact them to regain access.'
      });
    }
    if(user.role !== role){
      return res.status(400).json({ message : "Unauthorized Role"});
    }
    // console.log(user);
    if(role === "editor"){
    const invite = await Invite.findOne({ email });
    // console.log(invite);
      if (!invite) return res.status(400).json({ message: "No pending invite found" })

    if(invite.status === "pending"){
      return res.status(400).json({ message : "Please wait for invite acceptance"});
    }
    
    if(invite.youtuberId.toString() !== youtuberId){
      return res.status(400).json({ message : "Invalid YoutuberId! Please Enter the Correct ID"});
    }
  }
  
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({message : "Invalid Credentials, Please Check your Password and Email"})
    }

    const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, role: user.role , email : user.email});
  } catch (error) {
    res.status(500).json({ message: 'Error logging in' });
  }
});


module.exports = router;