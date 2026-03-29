const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  listing:     { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
  student:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  moveInDate:  { type: Date },
  status:      { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
  roomType:    { type: String },
  message:     { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);