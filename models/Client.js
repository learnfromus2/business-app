const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: false
  },
  phone: {
    type: String,
    required: true
  },
  address: {
    type: String
  },
  // Client type and business info
  clientType: {
    type: String,
    enum: ['individual', 'company', 'wedding', 'event'],
    default: 'individual'
  },
  businessCategory: {
    type: String,
    enum: ['video_editing', 'led_walls', 'drones', 'cameras', 'mixed'],
    default: 'mixed'
  },
  priorityLevel: {
    type: String,
    enum: ['normal', 'high', 'vip'],
    default: 'normal'
  },
  notes: {
    type: String
  },
  // Payment tracking
  totalPaymentsDue: {
    type: Number,
    default: 0
  },
  totalPaymentsReceived: {
    type: Number,
    default: 0
  },
  receivedPayments: {
    type: Number,
    default: 0
  },
  pendingPayments: {
    type: Number,
    default: 0
  },
  // Payment history
  paymentHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    amount: {
      type: Number,
      required: true
    },
    notes: {
      type: String
    },
    updatedBy: {
      type: String
    }
  }],
  // Lifetime statistics
  lifetimeOrders: {
    type: Number,
    default: 0
  },
  lifetimeEditingProjects: {
    type: Number,
    default: 0
  },
  lifetimeValue: {
    type: Number,
    default: 0
  },
  // Payment status
  paymentStatus: {
    type: String,
    enum: ['paid', 'pending', 'partial'],
    default: 'pending'
  },
  // Order and project history
  orderHistory: [{
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    amount: Number,
    status: String,
    date: Date
  }],
  editingHistory: [{
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EditingProject'
    },
    amount: Number,
    status: String,
    date: Date
  }],
  // Shop association
  shopName: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Client', clientSchema);