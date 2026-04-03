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

// GET my bookings — student sees their own bookings
router.get('/user/me', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    const bookings = await Booking.find({ student: user.userId })
      .populate('listing', 'title city price roomType available')
      .populate('student', 'name email')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// GET bookings for landlord — owner sees all bookings on their listings
router.get('/landlord', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    // Find all listings owned by this landlord
    const myListings = await Listing.find({ owner: user.userId }).select('_id');
    const listingIds = myListings.map(l => l._id);
    // Get all bookings for those listings
    const bookings = await Booking.find({ listing: { $in: listingIds } })
      .populate('listing', 'title city price roomType available')
      .populate('student', 'name email')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

// GET bookings by studentId (legacy — keep for backward compat)
router.get('/:studentId', async (req, res) => {
  try {
    const bookings = await Booking.find({ student: req.params.studentId })
      .populate('listing', 'title city price');
    res.json(bookings);
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// POST create booking → auto marks listing as unavailable
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

    // ✅ Mark listing as unavailable
    await Listing.findByIdAndUpdate(req.body.listing, { available: false });

    const populated = await booking.populate('listing', 'title city price roomType');
    res.json({ message: 'Booking created! Listing marked as unavailable.', booking: populated });
  } catch(err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

module.exports = router;
