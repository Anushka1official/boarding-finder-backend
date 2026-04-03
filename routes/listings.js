const express    = require('express');
const router     = express.Router();
const jwt        = require('jsonwebtoken');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const Listing    = require('../models/Listing');

// ── Auth helper ──────────────────────────────────
function getUser(req) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch { return null; }
}

// ── Cloudinary config (reads from Railway .env) ──
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Multer: store in memory (NOT on disk) ────────
// Files go: Browser → RAM → Cloudinary → URL saved in MongoDB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv|webm/;
    const ext  = allowed.test(file.originalname.split('.').pop().toLowerCase());
    const mime = allowed.test(file.mimetype.split('/')[1]);
    if (ext || mime) cb(null, true);
    else cb(new Error('Only image and video files are allowed'));
  }
});

// ── Helper: upload one file buffer to Cloudinary ─
function uploadToCloudinary(buffer, mimetype, folder) {
  return new Promise((resolve, reject) => {
    const isVideo      = mimetype.startsWith('video/');
    const resourceType = isVideo ? 'video' : 'image';
    const stream       = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => { if (error) reject(error); else resolve(result); }
    );
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(stream);
  });
}

// ── GET all listings ──────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.city) filter.city = new RegExp(req.query.city, 'i');
    if (req.query.roomType) filter.roomType = req.query.roomType;
    if (req.query.boardingFor) filter.boardingFor = req.query.boardingFor;
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

    const payload = {
      ...req.body,
      roomType: req.body.roomType,
      boardingFor: req.body.boardingFor,
      owner: user.userId,
      media: []
    };

    const listing = new Listing(payload);
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
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ message: 'Updated!', listing });
  } catch (err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
}
router.put('/:id',   updateListing);
router.patch('/:id', updateListing);

// ── POST upload media ─────────────────────────────
router.post('/:id/media', upload.array('media', 10), async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded.' });

    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });

    // Upload all files to Cloudinary at the same time
    const results = await Promise.all(
      req.files.map(f => uploadToCloudinary(f.buffer, f.mimetype, `smart-boarding/${req.params.id}`))
    );

    const newMedia = results.map((result, i) => ({
      url:      result.secure_url,   // Full Cloudinary HTTPS URL — stored in MongoDB
      publicId: result.public_id,   // Needed to delete from Cloudinary later
      type:     req.files[i].mimetype.startsWith('video/') ? 'video' : 'image',
      filename: result.public_id
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

    const mediaItem = listing.media[idx];

    // Delete from Cloudinary
    if (mediaItem.publicId) {
      const resourceType = mediaItem.type === 'video' ? 'video' : 'image';
      await cloudinary.uploader.destroy(mediaItem.publicId, { resource_type: resourceType })
        .catch(err => console.error('Cloudinary delete error:', err.message));
    }

    listing.media.splice(idx, 1);
    await listing.save();
    res.json({ message: 'Media deleted!', listing });
  } catch (err) {
    res.status(500).json({ error: 'Delete error: ' + err.message });
  }
});

// ── DELETE listing + all its Cloudinary media ─────
router.delete('/:id', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });

    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });

    if (listing.owner && listing.owner.toString() !== user.userId)
      return res.status(403).json({ error: 'You can only delete your own listings.' });

    // Delete all Cloudinary media files
    if (listing.media && listing.media.length) {
      await Promise.allSettled(
        listing.media.filter(m => m.publicId).map(m =>
          cloudinary.uploader.destroy(m.publicId, {
            resource_type: m.type === 'video' ? 'video' : 'image'
          })
        )
      );
    }

    await Listing.findByIdAndDelete(req.params.id);
    res.json({ message: 'Listing deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Delete error: ' + err.message });
  }
});

module.exports = router;
