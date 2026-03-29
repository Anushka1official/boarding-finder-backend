const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const Listing = require('../models/Listing');

function getUser(req) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch { return null; }
}

// GET all listings
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.city) filter.city = new RegExp(req.query.city, 'i');
    const listings = await Listing.find(filter).sort({ createdAt: -1 });
    res.json(listings);
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// GET one listing
router.get('/:id', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Not found.' });
    res.json(listing);
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// POST create listing
router.post('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    const listing = new Listing({ ...req.body, owner: user.userId });
    await listing.save();
    res.json({ message: 'Listing created!', listing });
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// PUT / PATCH update listing (supports both methods)
async function updateListing(req, res) {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    const listing = await Listing.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true }
    );
    if (!listing) return res.status(404).json({ error: 'Not found.' });
    res.json({ message: 'Updated!', listing });
  } catch { res.status(500).json({ error: 'Server error.' }); }
}
router.put('/:id', updateListing);
router.patch('/:id', updateListing);

module.exports = router;
