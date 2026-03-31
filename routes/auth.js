const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const twilio = require('twilio');

// Twilio client — reads credentials from .env
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ── Helper: generate 6-digit OTP ─────────────────
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Auth middleware ───────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── SIGNUP ────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashed, role });
    await user.save();
    res.json({ message: 'Account created! Please login.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── LOGIN ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'User not found' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Wrong password' });
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      name:          user.name,
      role:          user.role,
      userId:        user._id,
      phoneVerified: user.phoneVerified,
      phone:         user.phone || null,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SEND OTP ──────────────────────────────────────
// POST /api/auth/send-otp
// Body: { phone: '+94771234567' }
// Requires: Bearer token
router.post('/send-otp', authMiddleware, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    // Basic E.164 format check
    const cleaned = phone.trim();
    if (!/^\+\d{7,15}$/.test(cleaned)) {
      return res.status(400).json({ error: 'Please enter a valid phone number in international format (e.g. +94771234567)' });
    }

    // Check if this phone is already verified by another account
    const existing = await User.findOne({ phone: cleaned, phoneVerified: true });
    if (existing && existing._id.toString() !== req.user.userId) {
      return res.status(400).json({ error: 'This phone number is already verified by another account' });
    }

    const otp     = generateOtp();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to user
    await User.findByIdAndUpdate(req.user.userId, {
      phone:           cleaned,
      phoneOtp:        otp,
      phoneOtpExpires: expires,
    });

    // Send SMS via Twilio
    await twilioClient.messages.create({
      body: `Your Smart Boarding verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to:   cleaned,
    });

    res.json({ message: 'OTP sent successfully! Check your phone.' });
  } catch(e) {
    console.error('Send OTP error:', e.message);
    res.status(500).json({ error: 'Failed to send OTP. Please check your phone number and try again.' });
  }
});

// ── VERIFY OTP ────────────────────────────────────
// POST /api/auth/verify-otp
// Body: { otp: '123456' }
// Requires: Bearer token
router.post('/verify-otp', authMiddleware, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'OTP is required' });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.phoneOtp || !user.phoneOtpExpires) {
      return res.status(400).json({ error: 'No OTP requested. Please request a new OTP first.' });
    }

    if (new Date() > user.phoneOtpExpires) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (user.phoneOtp !== otp.trim()) {
      return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
    }

    // Mark as verified and clear OTP
    await User.findByIdAndUpdate(req.user.userId, {
      phoneVerified:   true,
      phoneOtp:        null,
      phoneOtpExpires: null,
    });

    res.json({ message: 'Phone verified successfully! You are now a Verified Owner ✅' });
  } catch(e) {
    console.error('Verify OTP error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET VERIFICATION STATUS ───────────────────────
// GET /api/auth/me
// Requires: Bearer token
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password -phoneOtp -phoneOtpExpires');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      name:          user.name,
      email:         user.email,
      role:          user.role,
      phone:         user.phone,
      phoneVerified: user.phoneVerified,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

