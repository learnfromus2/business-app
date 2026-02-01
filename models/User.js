const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: false // Not required for Google auth users
  },
  shopName: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['owner', 'worker', 'editor', 'worker_editor', 'transporter', 'transporter_worker'],
    required: true
  },
  phone: {
    type: String,
    default: ''
  },
  // For creating editor from existing worker
  isFromWorker: {
    type: Boolean,
    default: false
  },
  originalWorkerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // For creating worker from existing editor
  isFromEditor: {
    type: Boolean,
    default: false
  },
  originalEditorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Firebase UID for Google auth users
  firebaseUID: {
    type: String,
    sparse: true,
    unique: true
  },
  // Profile completion status
  profileComplete: {
    type: Boolean,
    default: false
  },
  // Salary and payment tracking
  totalEarnings: {
    type: Number,
    default: 0
  },
  paidSalary: {
    type: Number,
    default: 0
  },
  remainingSalary: {
    type: Number,
    default: 0
  },
  // Performance tracking
  accuracyRating: {
    type: Number,
    default: 5,
    min: 1,
    max: 10
  },
  workingGraphs: [{
    date: {
      type: Date,
      default: Date.now
    },
    ordersCompleted: {
      type: Number,
      default: 0
    },
    editingCompleted: {
      type: Number,
      default: 0
    },
    transportCompleted: {
      type: Number,
      default: 0
    }
  }],
  // Notification settings
  notifications: [{
    message: String,
    type: {
      type: String,
      enum: ['salary', 'work', 'promotion', 'general']
    },
    isRead: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Timestamps
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);