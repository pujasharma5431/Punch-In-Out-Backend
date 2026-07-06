// ─────────────────────────────────────────────────────────
//  Volunteer.js  —  Mongoose schema & model
// ─────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const volunteerSchema = new mongoose.Schema(
  {
    fullName:  { type: String, required: true, trim: true },
    email:     { type: String, required: true, trim: true, lowercase: true },
    phone:     { type: String, required: true, trim: true },
    punchIn:   { type: Date,   required: true, default: Date.now },
    punchOut:  { type: Date,   default: null },
    duration:  { type: String, default: null },   // e.g. "1h 23m 45s"
    date:      { type: String },                  // localeDateString for easy filtering
  },
  { timestamps: true }   // adds createdAt / updatedAt automatically
);

// Virtual: is the volunteer still checked in?
volunteerSchema.virtual('isActive').get(function () {
  return !this.punchOut;
});

module.exports = mongoose.model('Volunteer', volunteerSchema);
