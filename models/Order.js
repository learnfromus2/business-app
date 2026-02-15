const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  // Order details
  orderName: {
    type: String,
    required: true
  },
  venuePlace: {
    type: String,
    required: true
  },
  // Product details
  products: [{
    name: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    sizeInfo: {
      type: String,
      default: ''
    }
  }],
  // Payment information
  totalAmount: {
    type: Number,
    required: true
  },
  receivedPayment: {
    type: Number,
    default: 0
  },
  remainingPayment: {
    type: Number,
    required: true
  },
  // Workers assignment (owner selects only workers)
  workers: [{
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    payment: {
      type: Number,
      required: true
    }
  }],
  // Transporters assignment (one or more)
  transporters: [{
    transporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    payment: {
      type: Number,
      required: true
    }
  }],
  // Order details
  description: {
    type: String,
    default: ''
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  completionDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending'
  },
  // Business type
  businessType: {
    type: String,
    enum: ['led_walls_drones_cameras'],
    default: 'led_walls_drones_cameras'
  },
  // Owner who created the order
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Shop association
  shopName: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);