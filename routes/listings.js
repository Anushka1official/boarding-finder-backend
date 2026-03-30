const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const Listing  = require('../models/Listing');

// ── Auth helper ──────────────────────────────────
function getUser(req) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch { return null; }
}

// ── Multer setup — save to uploads/ folder ────────
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv|webm/;
  const ext     = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime    = allowed.test(file.mimetype.split('/')[1]);
  if (ext || mime) cb(null, true);
  else cb(new Error('Only image and video files are allowed'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB per file
});

// ── GET all listings ──────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.city) filter.city = new RegExp(req.query.city, 'i');
    const listings = await Listing.find(filter).sort({ createdAt: -1 });
    res.json(listings);
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// ── GET one listing ───────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (req.params.id === 'undefined') return res.status(400).json({ error: 'Invalid ID.' });
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    res.json(listing);
  } catch { res.status(500).json({ error: 'Server error.' }); }
});

// ── POST create listing ───────────────────────────
router.post('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    const listing = new Listing({ ...req.body, owner: user.userId, media: [] });
    await listing.save();
    res.json({ message: 'Listing created!', listing });
  } catch (err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

// ── PUT / PATCH update listing ────────────────────
async function updateListing(req, res) {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    const listing = await Listing.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true }
    );
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ message: 'Updated!', listing });
  } catch { res.status(500).json({ error: 'Server error.' }); }
}
router.put('/:id',   updateListing);
router.patch('/:id', updateListing);

// ── POST upload media to a listing ───────────────
router.post('/:id/media', upload.array('media', 10), async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded.' });

    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });

    const newMedia = req.files.map(file => ({
      url:      '/uploads/' + file.filename,
      type:     file.mimetype.startsWith('video/') ? 'video' : 'image',
      filename: file.filename
    }));

    listing.media = [...(listing.media || []), ...newMedia];
    await listing.save();

    res.json({ message: `${newMedia.length} file(s) uploaded!`, listing });
  } catch (err) {
    res.status(500).json({ error: 'Upload error: ' + err.message });
  }
});

// ── DELETE one media item ─────────────────────────
router.delete('/:id/media/:mediaIndex', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });

    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });

    const idx = parseInt(req.params.mediaIndex);
    if (isNaN(idx) || idx < 0 || idx >= listing.media.length)
      return res.status(400).json({ error: 'Invalid media index.' });

    // Delete the file from disk
    const mediaItem = listing.media[idx];
    const filePath  = path.join(__dirname, '..', 'uploads', path.basename(mediaItem.url));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    listing.media.splice(idx, 1);
    await listing.save();

    res.json({ message: 'Media deleted!', listing });
  } catch (err) {
    res.status(500).json({ error: 'Delete error: ' + err.message });
  }
});

module.exports = router;
