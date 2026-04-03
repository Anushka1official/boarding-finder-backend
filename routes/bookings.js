const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');

function getUser(req) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch { return null; }
}

// ── GET bookings made BY the logged-in student ────
router.get('/user/me', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    const bookings = await Booking.find({ student: user.userId })
      .populate('listing', 'title city price roomType media')
      .populate('student', 'name email')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// ── GET bookings RECEIVED by the logged-in landlord ──
router.get('/landlord', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    const myListings = await Listing.find({ owner: user.userId }).select('_id');
    const listingIds = myListings.map(l => l._id);
    if (!listingIds.length) return res.json([]);
    const bookings = await Booking.find({ listing: { $in: listingIds } })
      .populate('listing', 'title city price roomType media')
      .populate('student', 'name email')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch(err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

// ── GET by studentId (legacy) ─────────────────────
router.get('/:studentId', async (req, res) => {
  try {
    const bookings = await Booking.find({ student: req.params.studentId })
      .populate('listing', 'title city price');
    res.json(bookings);
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// ── POST create booking ───────────────────────────
router.post('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });

    const listing = await Listing.findById(req.body.listing);
    if (!listing)           return res.status(404).json({ error: 'Listing not found.' });
    if (!listing.available) return res.status(400).json({ error: 'This listing is no longer available.' });

    const booking = new Booking({
      listing:    req.body.listing,
      student:    user.userId,
      moveInDate: req.body.moveInDate,
      roomType:   req.body.roomType,
      message:    req.body.message || '',
      status:     'booked'          // ← instantly booked, no pending/confirm flow
    });
    await booking.save();

    // Mark listing as unavailable immediately
    await Listing.findByIdAndUpdate(req.body.listing, { available: false });

    const populated = await booking.populate('listing', 'title city price roomType');
    res.json({ message: 'Booking created!', booking: populated });
  } catch(err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

module.exports = router;
