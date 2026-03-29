const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Not logged in' });
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

// GET my bookings (as student)
router.get('/my', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ student: req.user.userId })
      .populate('listing', 'title city price')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET bookings for landlord's listings
router.get('/landlord', auth, async (req, res) => {
  try {
    const Listing = require('../models/Listing');
    const myListings = await Listing.find({ owner: req.user.userId }).select('_id');
    const ids = myListings.map(l => l._id);
    const bookings = await Booking.find({ listing: { $in: ids } })
      .populate('listing', 'title city')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST create a booking
router.post('/', auth, async (req, res) => {
  try {
    const booking = new Booking({ ...req.body, student: req.user.userId });
    await booking.save();
    res.json({ message: 'Booking created!', booking });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT update booking status
router.put('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ message: 'Booking updated!', booking });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
