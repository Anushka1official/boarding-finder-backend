const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  city:        { type: String, required: true },
  address:     { type: String },
  description: { type: String },
  price:       { type: Number, required: true },
  roomType:    { type: String, default: 'Single' },
  vacancies:   { type: Number, default: 1 },
  distance:    { type: String },
  amenities:   [String],
  images:      [String],
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  available:   { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Listing', listingSchema);
