const express = require('express');
const router = express.Router();
const Listing = require('../models/Listing');
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

// GET all listings (with optional city filter)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.city) filter.city = new RegExp(req.query.city, 'i');
    if (req.query.available === 'true') filter.available = true;
    const listings = await Listing.find(filter).sort({ createdAt: -1 });
    res.json(listings);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET my listings (landlord)
router.get('/my', auth, async (req, res) => {
  try {
    const listings = await Listing.find({ owner: req.user.userId }).sort({ createdAt: -1 });
    res.json(listings);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET one listing by ID
router.get('/:id', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    res.json(listing);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST create new listing
router.post('/', auth, async (req, res) => {
  try {
    const listing = new Listing({ ...req.body, owner: req.user.userId });
    await listing.save();
    res.json({ message: 'Listing created!', listing });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT update listing
router.put('/:id', auth, async (req, res) => {
  try {
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.userId },
      req.body,
      { new: true }
    );
    if (!listing) return res.status(404).json({ error: 'Listing not found or not yours' });
    res.json({ message: 'Listing updated!', listing });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE listing
router.delete('/:id', auth, async (req, res) => {
  try {
    const listing = await Listing.findOneAndDelete({ _id: req.params.id, owner: req.user.userId });
    if (!listing) return res.status(404).json({ error: 'Listing not found or not yours' });
    res.json({ message: 'Listing deleted!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
