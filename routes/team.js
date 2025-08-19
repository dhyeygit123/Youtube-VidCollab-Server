// routes/team.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const PendingInvite = require('../models/Invite');
const { sendNotificationEmail } = require("../utils/mail");
const Video = require('../models/Video');

// GET /api/team/editor/:id/history
router.get('/editor/:id/history', authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== 'youtuber') {
        return res.status(403).json({ message: 'Only youtubers can view editor history' });
      }
  
      const editor = await User.findOne({
        _id: req.params.id,
        youtuberId: req.user.id,
        role: 'editor'
      });
      if (!editor) {
        return res.status(404).json({ message: 'Editor not found in your team' });
      }
  
      const videos = await Video.find({
        $or: [
          { uploadedBy: editor._id.toString() },
          { uploadedBy: editor.email }
        ],
        youtuberId: req.user.id
      }).sort({ createdAt: -1 });
  
      // Build logs format
      const logs = videos.map(video => ({
        _id: video._id,
        action: 'video_upload',
        description: `Uploaded video: ${video.name}`,
        timestamp: video.createdAt,
        details: {
          status: video.status,
          link: video.link
        }
      }));
  
      // Stats
      const stats = {
        totalActions: logs.length,
        videosUploaded: logs.length,
        lastActivity: logs.length > 0 ? logs[0].timestamp : null
      };
  
      res.json({ logs, stats });
    } catch (error) {
      console.error('Error fetching editor history:', error);
      res.status(500).json({ message: 'Server error fetching editor history' });
    }
  });
  

// GET /api/team/editors
router.get('/editors', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'youtuber') {
            return res.status(403).json({ message: 'Only youtubers can view their editors' });
        }
        // console.log(req.user)
        // Find all editors linked to this YouTuber
        const editors = await User.find({
            youtuberId: req.user.id,
            role: 'editor'
        }).select('-password');


        res.json(editors);
    } catch (error) {
        console.error('Error fetching editors:', error);
        res.status(500).json({ message: 'Server error fetching editors' });
    }
});

router.get('/pending-invites', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'youtuber') {
            return res.status(403).json({ message: 'Only youtubers can view pending invites' });
        }

        const pendingInvites = await PendingInvite.find({
            youtuberId: req.user.id,
            status: 'pending',
            expiresAt: { $gt: new Date() } // Only non-expired invites
        }).sort({ requestedAt: -1 });

        res.json(pendingInvites);
    } catch (error) {
        console.error('Error fetching pending invites:', error);
        res.status(500).json({ message: 'Server error fetching pending invites' });
    }
});


router.post('/pending-invites/:id/approve', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'youtuber') {
            return res.status(403).json({ message: 'Only youtubers can approve invites' });
        }

        const pendingInvite = await PendingInvite.findOne({
            _id: req.params.id,
            youtuberId: req.user.id,
            status: 'pending'
        });

        if (!pendingInvite) {
            return res.status(404).json({ message: 'Pending invite not found' });
        }

        // Check if invite has expired
        if (pendingInvite.expiresAt < new Date()) {
            return res.status(400).json({ message: 'Invite has expired' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email: pendingInvite.email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create the user account
        const newUser = new User({
            email: pendingInvite.email,
            password: pendingInvite.password, // Already hashed
            role: 'editor',
            youtuberId: req.user.id,
            status: 'active'
        });

        await newUser.save();

        // Update pending invite status
        pendingInvite.status = 'approved';
        pendingInvite.respondedAt = new Date();
        await pendingInvite.save();

        // Send approval notification to editor
        const subject = 'Your Editor Account Has Been Approved!';
        const emailText = `
Great news!

Your request to join the editing team has been approved. You can now log into your account and start collaborating.

Login Details:
- Email: ${pendingInvite.email}
- Role: Editor
- Dashboard: ${process.env.FRONTEND_URL}

Welcome to the team!

Best regards,
The Video Editing Platform Team
        `;

        try {
            await sendNotificationEmail(pendingInvite.email, subject, emailText);
        } catch (emailError) {
            console.error('Failed to send approval email:', emailError);
        }

        res.json({ 
            message: 'Editor approved successfully',
            editor: {
                _id: newUser._id,
                email: newUser.email,
                role: newUser.role,
                status: newUser.status
            }
        });
    } catch (error) {
        console.error('Error approving invite:', error);
        res.status(500).json({ message: 'Server error approving invite' });
    }
});


router.post('/pending-invites/:id/deny', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'youtuber') {
            return res.status(403).json({ message: 'Only youtubers can deny invites' });
        }

        const { reason } = req.body; // Optional denial reason

        const pendingInvite = await PendingInvite.findOne({
            _id: req.params.id,
            youtuberId: req.user.id,
            status: 'pending'
        });

        if (!pendingInvite) {
            return res.status(404).json({ message: 'Pending invite not found' });
        }

        // Update pending invite status
        pendingInvite.status = 'denied';
        pendingInvite.respondedAt = new Date();
        await pendingInvite.save();

        // Send denial notification to editor
        const subject = 'Editor Account Request Update';
        const emailText = `
Hello,

Thank you for your interest in joining our editing team. Unfortunately, your request to join as an editor has been declined at this time.

${reason ? `Reason: ${reason}` : ''}

You're welcome to try again in the future or reach out directly to discuss potential opportunities.

Best regards,
The Video Editing Platform Team
        `;

        try {
            await sendNotificationEmail(pendingInvite.email, subject, emailText);
        } catch (emailError) {
            console.error('Failed to send denial email:', emailError);
        }

        res.json({ message: 'Editor request denied successfully' });
    } catch (error) {
        console.error('Error denying invite:', error);
        res.status(500).json({ message: 'Server error denying invite' });
    }
});



// PATCH /api/team/editor/:id/activate
router.patch('/editor/:id/activate', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'youtuber') {
            return res.status(403).json({ message: 'Only youtubers can change editor status' });
        }

        const editor = await User.findOneAndUpdate(
            { _id: req.params.id, youtuberId: req.user.id },
            { status: 'active' },
            { new: true }
        ).select('-password');

        //   console.log(editor);

        if (!editor) return res.status(404).json({ message: 'Editor not found' });

        res.json({ message: 'Editor activated successfully', editor });
    } catch (error) {
        console.error('Error activating editor:', error);
        res.status(500).json({ message: 'Server error activating editor' });
    }
});

// PATCH /api/team/editor/:id/deactivate
router.patch('/editor/:id/deactivate', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'youtuber') {
            return res.status(403).json({ message: 'Only youtubers can change editor status' });
        }

        const editor = await User.findOneAndUpdate(
            { _id: req.params.id, youtuberId: req.user.id },
            { status: 'inactive' },
            { new: true }
        ).select('-password');

        //   console.log(editor);

        if (!editor) return res.status(404).json({ message: 'Editor not found' });

        res.json({ message: 'Editor deactivated successfully', editor });
    } catch (error) {
        console.error('Error deactivating editor:', error);
        res.status(500).json({ message: 'Server error deactivating editor' });
    }
});


// DELETE /api/team/editor/:id
router.delete('/editor/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'youtuber') {
            return res.status(403).json({ message: 'Only youtubers can remove editors' });
        }

        const deleted = await User.findOneAndDelete({
            _id: req.params.id,
            youtuberId: req.user.id,
            role: 'editor'
        });

        if (!deleted) {
            return res.status(404).json({ message: 'Editor not found in your team' });
        }

        res.json({ message: 'Editor removed successfully' });
    } catch (error) {
        console.error('Error removing editor:', error);
        res.status(500).json({ message: 'Server error removing editor' });
    }
});

router.post('/invite', authMiddleware, async (req, res) => {
    try {
      const { email } = req.body;
      const youtuberId = req.user.id; // Get from authenticated user
  
      // Validation
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }
  
      // Email validation regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }
  
      // Check if user is a youtuber
      const youtuber = await User.findById(youtuberId);
      if (!youtuber || youtuber.role !== 'youtuber') {
        return res.status(403).json({ message: 'Only YouTubers can invite editors' });
      }
  
      // Check if the email is already invited or is an existing editor
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser.role === 'editor' && existingUser.youtuberId?.toString() === youtuberId) {
        return res.status(400).json({ message: 'User is already an editor in your team' });
      }
  
      // Generate invite token (optional - for secure invite links)
    //   const inviteToken = jwt.sign(
    //     { email, youtuberId, type: 'editor_invite' },
    //     process.env.JWT_SECRET,
    //     { expiresIn: '7d' } // Invite expires in 7 days
    //   );
  
      // Create invite link (adjust your frontend URL)
    //   const inviteLink = `${process.env.FRONTEND_URL}/accept-invite?token=${inviteToken}`;
  
      // Email content
      const subject = `You're invited to join ${youtuber.email.split('@')[0]}'s editing team!`;
      const emailText = `
  Hello!
  
  You've been invited to join ${youtuber.email.split('@')[0]}'s editing team as a video editor.
  
  As an editor, you'll be able to:
  • Access and edit assigned video content
  • Collaborate on video projects
  • Manage editing tasks and deadlines
  
  To accept this invitation, Enter the provided ID while signing up.
  
  This invitation will expire in 7 days.
  
  If you have any questions, feel free to reach out to ${youtuber.email}.
  
  YouTuber ID: ${youtuberId}
  
  Best regards,
  The Video Editing Platform Team
      `;
  
      // Send the email
      await sendNotificationEmail(email, subject, emailText);
  
      // Optionally, save the invite to database for tracking
      // You might want to create an Invites collection to track pending invites
      /*
      const invite = new Invite({
        email,
        youtuberId,
        token: inviteToken,
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });
      await invite.save();
      */
  
      res.status(200).json({ 
        message: 'Invite sent successfully',
        email: email,
        youtuberId: youtuberId
      });
  
    } catch (error) {
      console.error('Error sending invite:', error);
      res.status(500).json({ message: 'Failed to send invite email' });
    }
  });
  
module.exports = router;
