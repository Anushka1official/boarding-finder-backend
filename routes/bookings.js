const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const User    = require('../models/User');

function getUser(req) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch { return null; }
}

// ── GET bookings made BY the logged-in student ────
// Used by students to see their own bookings
router.get('/user/me', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    const bookings = await Booking.find({ student: user.userId })
      .populate('listing', 'title city price roomType media')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// ── GET bookings RECEIVED by the logged-in owner ──
// Used by landlords to see who booked their listings
router.get('/owner/me', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });

    // Find all listings owned by this user
    const myListings = await Listing.find({ owner: user.userId }, '_id');
    const listingIds = myListings.map(l => l._id);

    if (!listingIds.length) return res.json([]);

    // Find all bookings for those listings, populate listing + student name
    const bookings = await Booking.find({ listing: { $in: listingIds } })
      .populate('listing', 'title city price roomType')
      .populate('student', 'name email')
      .sort({ createdAt: -1 });

    // Attach student name to each booking for easy display
    const result = bookings.map(b => ({
      ...b.toObject(),
      studentName:  b.student?.name  || 'Student',
      studentEmail: b.student?.email || '',
    }));

    res.json(result);
  } catch (e) {
    console.error('Owner bookings error:', e.message);
    res.status(500).json({ error: 'Server error.' });
  }
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
      status:     'pending'
    });
    await booking.save();

    // Mark listing as unavailable
    await Listing.findByIdAndUpdate(req.body.listing, { available: false });

    const populated = await booking.populate('listing', 'title city price roomType');
    res.json({ message: 'Booking created! Listing marked as unavailable.', booking: populated });
  } catch(err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

module.exports = router;
