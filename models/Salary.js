const mongoose = require('mongoose');

const salarySchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Salary details
  amount: {
    type: Number,
    required: true
  },
  salaryType: {
    type: String,
    enum: ['order_work', 'editing_work', 'transport_work', 'bonus', 'commission'],
    required: true
  },
  // Related work reference
  relatedOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  relatedProject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EditingProject'
  },
  // Payment status
  isPaid: {
    type: Boolean,
    default: false
  },
  paidDate: {
    type: Date
  },
  // Owner approval
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedDate: {
    type: Date
  },
  // Description
  description: {
    type: String
  },
  // Work date
  workDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Salary', salarySchema);