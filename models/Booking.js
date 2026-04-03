const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  listing:    { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
  student:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  moveInDate: { type: Date },
  status:     { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  roomType:       { type: String },
  bookingType:    { type: String, enum: ['available', 'future'], default: 'available' },
  futureVacancyMonths: { type: Number, default: 0 },
  message:        { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
