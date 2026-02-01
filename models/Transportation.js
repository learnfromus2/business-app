const mongoose = require('mongoose');

const transportationSchema = new mongoose.Schema({
  relatedOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: false
  },
  relatedProject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EditingProject',
    required: false
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: false
  },
  transporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  pickupLocation: {
    type: String,
    required: true
  },
  deliveryLocation: {
    type: String,
    required: true
  },
  distance: {
    type: Number,
    default: 0
  },
  transportFee: {
    type: Number,
    required: true
  },
  equipmentList: {
    type: String,
    default: ''
  },
  transportDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'in-transit', 'delivered', 'cancelled'],
    default: 'pending'
  },
  instructions: {
    type: String,
    default: ''
  },
  shopName: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  completedDate: {
    type: Date
  }
}, {
  timestamps: true
});

// Calculate commission amount based on percentage
transportationSchema.virtual('commissionAmount').get(function() {
  return Math.round((this.transportFee * (this.commissionPercentage || 0)) / 100);
});

// Ensure virtual fields are serialized
transportationSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Transportation', transportationSchema);