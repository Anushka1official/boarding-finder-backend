const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  url:      { type: String, required: true },  // Full Cloudinary HTTPS URL
  publicId: { type: String },                  // Cloudinary public_id (needed to delete)
  type:     { type: String, enum: ['image', 'video'], required: true },
  filename: { type: String }
});

const listingSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  city:        { type: String, required: true },
  price:       { type: Number, required: true },
  deposit:     { type: Number, default: 0 },
  advance:     { type: Number, default: 0 },
  roomType:    { type: String, enum: ['Single Room', 'Shared Room'], required: true },
  boardingFor: { type: String, enum: ['Ladies Only', 'Gents Only'], required: true },
  amenities:   [String],
  description: { type: String, default: '' },
  media:       [mediaSchema],
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  available:           { type: Boolean, default: true },
  futureVacancyMonths: { type: Number, min: 0, max: 12, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Listing', listingSchema);
