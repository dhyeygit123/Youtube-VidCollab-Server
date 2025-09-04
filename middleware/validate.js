const validateSignup = (req, res, next) => {
    const { email, password, role, youtuberId } = req.body;
  
    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Email, password, and role are required' });
    }
  
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
  
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
  
    if (!['youtuber', 'editor'].includes(role)) {
      return res.status(400).json({ message: 'Role must be youtuber or editor' });
    }
  
    if (role === 'editor' && !youtuberId) {
      return res.status(400).json({ message: 'YouTuber ID is required for editors' });
    }
  
    next();
  };
  
  const validateLogin = (req, res, next) => {
    const { email, password } = req.body;
  
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
  
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
  
    next();
  };
  
  module.exports = { validateSignup, validateLogin };