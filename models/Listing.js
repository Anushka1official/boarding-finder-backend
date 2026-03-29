const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  city:        { type: String, required: true },
  price:       { type: Number, required: true },
  roomType:    { type: String, default: 'Any' },
  amenities:   [String],
  images:      [String],
  description: { type: String, default: '' },
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  available:   { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Listing', listingSchema);
