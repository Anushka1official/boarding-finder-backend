const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  url:      { type: String, required: true },
  type:     { type: String, enum: ['image', 'video'], required: true },
  filename: { type: String }
});

const listingSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  city:        { type: String, required: true },
  price:       { type: Number, required: true },
  deposit:     { type: Number, default: 0 },
  advance:     { type: Number, default: 0 },
  roomType:    { type: String, default: 'Any' },
  amenities:   [String],
  rules:       [String],
  description: { type: String, default: '' },
  media:       [mediaSchema],
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  available:   { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Listing', listingSchema);
