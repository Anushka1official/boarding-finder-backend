const express      = require('express');
const router       = express.Router();
const jwt          = require('jsonwebtoken');
const multer       = require('multer');
const cloudinary   = require('cloudinary').v2;
const { Readable } = require('stream');
const Listing      = require('../models/Listing');
const Booking      = require('../models/Booking');


function getUser(req) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch { return null; }
}


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});      

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


function normalizeFutureMonths(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(12, Math.floor(n));
}   


async function getVisibleBookedListingIdsForUser(user) {
  if (!user) return [];

  const ids = new Set();

  const ownListings = await Listing.find({ owner: user.userId }).select('_id');
  ownListings.forEach(l => ids.add(String(l._id)));

  const myBookings = await Booking.find({ student: user.userId, status: 'active' }).select('listing');
  myBookings.forEach(b => {
    if (b.listing) ids.add(String(b.listing));
  });

  return [...ids];
}   

router.get('/', async (req, res) => {
  try {
    const user = getUser(req);
    const filter = {};

    if (req.query.city) filter.city = new RegExp(req.query.city, 'i');
    if (req.query.roomType) filter.roomType = req.query.roomType;
    if (req.query.boardingFor) filter.boardingFor = req.query.boardingFor;

    if (req.query.futureVacancyMonths) {
      const months = normalizeFutureMonths(req.query.futureVacancyMonths);
      filter.futureVacancyMonths = months;
    }

    const visibility = req.query.visibility || '';
    if (visibility === 'available') {
      filter.available = true;
    } else if (visibility === 'future') {
      filter.available = false;
      filter.futureVacancyMonths = { $gt: 0 };
    }

    const visibleBookedListingIds = await getVisibleBookedListingIdsForUser(user);
    filter.$or = [
      { available: true },
      { available: false, futureVacancyMonths: { $gt: 0 } }
    ];

    if (visibleBookedListingIds.length) {
      filter.$or.push({ _id: { $in: visibleBookedListingIds } });
    }

    const listings = await Listing.find(filter).sort({ createdAt: -1 });
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (req.params.id === 'undefined') return res.status(400).json({ error: 'Invalid ID.' });

    const listing = await Listing.findById(req.params.id).populate('owner', 'name email phone role');
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });

    if (!listing.available && !(listing.futureVacancyMonths > 0)) {
      const user = getUser(req);
      const booking = user
        ? await Booking.findOne({ listing: listing._id, student: user.userId, status: 'active' }).select('_id')
        : null;
      const ownerId = listing.owner && (listing.owner._id ? String(listing.owner._id) : String(listing.owner));
      const isOwner = user && ownerId === user.userId;
      if (!isOwner && !booking) {
        return res.status(404).json({ error: 'Listing not found.' });
      }
    }

    res.json(listing);
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });

    const futureVacancyMonths = normalizeFutureMonths(req.body.futureVacancyMonths);
    const available = req.body.available === true || req.body.available === 'true';

    const payload = {
      ...req.body,
      roomType: req.body.roomType,
      boardingFor: req.body.boardingFor,
      available,
      futureVacancyMonths: available ? 0 : futureVacancyMonths,
      owner: user.userId,
      media: []
    };

    const listing = new Listing(payload);
    await listing.save();
    res.json({ message: 'Listing created!', listing });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

async function updateListing(req, res) {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });

    const updates = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updates, 'available')) {
      updates.available = updates.available === true || updates.available === 'true';
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'futureVacancyMonths')) {
      updates.futureVacancyMonths = normalizeFutureMonths(updates.futureVacancyMonths);
    }
    if (updates.available === true) {
      updates.futureVacancyMonths = 0;
    }

    const previousListing = await Listing.findById(req.params.id);
    if (!previousListing) return res.status(404).json({ error: 'Listing not found.' });

    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    if (listing.available || listing.futureVacancyMonths > 0) {
      await Booking.updateMany(
        { listing: listing._id, status: 'active' },
        { $set: { status: 'inactive' } }
      );
    }

    res.json({ message: 'Updated!', listing });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
router.put('/:id',   updateListing);
router.patch('/:id', updateListing);

router.post('/:id/media', upload.array('media', 10), async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded.' });

    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });

    const results = await Promise.all(
      req.files.map(f => uploadToCloudinary(f.buffer, f.mimetype, `smart-boarding/${req.params.id}`))
    );

    const newMedia = results.map((result, i) => ({
      url:      result.secure_url,
      publicId: result.public_id,
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

router.delete('/:id', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Login required.' });

    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });

    if (listing.owner && listing.owner.toString() !== user.userId)
      return res.status(403).json({ error: 'You can only delete your own listings.' });

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
