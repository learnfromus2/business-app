const mongoose = require('mongoose');

const editingProjectSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  // Editor selection
  editor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Project details
  projectName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
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
  // Editor commission
  commissionPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  commissionAmount: {
    type: Number,
    required: true
  },
  // Project timeline
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  completionDate: {
    type: Date
  },
  // Project status
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending'
  },
  // Owner who created the project
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

// Calculate commission amount before saving
editingProjectSchema.pre('save', function(next) {
  if (this.totalAmount && this.commissionPercentage) {
    this.commissionAmount = Math.round((this.totalAmount * this.commissionPercentage) / 100);
  }
  
  // Calculate remaining payment
  if (this.totalAmount && this.receivedPayment !== undefined) {
    this.remainingPayment = this.totalAmount - this.receivedPayment;
  }
  
  next();
});

module.exports = mongoose.model('EditingProject', editingProjectSchema);