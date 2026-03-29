const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
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

// GET all reviews for a listing
router.get('/:listingId', async (req, res) => {
  try {
    const reviews = await Review.find({ listing: req.params.listingId })
      .populate('student', 'name')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST create a review
router.post('/', auth, async (req, res) => {
  try {
    const review = new Review({ ...req.body, student: req.user.userId });
    await review.save();
    const populated = await review.populate('student', 'name');
    res.json({ message: 'Review added!', review: populated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
