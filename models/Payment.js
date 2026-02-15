const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Order reference
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  // Client reference
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  // Payment details
  amount: {
    type: Number,
    required: true
  },
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other'],
    default: 'cash'
  },
  // Who received the payment
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Notes
  notes: {
    type: String,
    default: ''
  },
  // Shop association
  shopName: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Payment', paymentSchema);
