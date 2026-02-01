const mongoose = require('mongoose');

const ownershipRequestSchema = new mongoose.Schema({
  shopName: {
    type: String,
    required: true
  },
  requestorEmail: {
    type: String,
    required: true
  },
  requestorName: {
    type: String,
    required: true
  },
  existingOwnerEmail: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  requestToken: {
    type: String,
    required: true,
    unique: true
  },
  message: {
    type: String,
    default: ''
  },
  // Approval details
  approvedAt: {
    type: Date
  },
  approvedBy: {
    type: String
  },
  rejectedAt: {
    type: Date
  },
  rejectedBy: {
    type: String
  },
  // Expiration
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  }
}, {
  timestamps: true
});

// Index for cleanup of expired requests
ownershipRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OwnershipRequest', ownershipRequestSchema);