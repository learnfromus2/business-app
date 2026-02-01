const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Global variable to track database connection status
let isDbConnected = false;

// Enhanced Database connection with better error handling
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/business_management', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      bufferMaxEntries: 0, // Disable mongoose buffering
      bufferCommands: false, // Disable mongoose buffering
    });
    
    isDbConnected = true;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
      isDbConnected = false;
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
      isDbConnected = false;
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
      isDbConnected = true;
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    isDbConnected = false;
    
    // Don't exit the process, continue with limited functionality
    console.log('⚠️ Server will continue with limited functionality (no database)');
    
    // Retry connection after 30 seconds
    setTimeout(connectDB, 30000);
  }
};

// Connect to database
connectDB();

// Middleware to check database connection
const checkDbConnection = (req, res, next) => {
  if (!isDbConnected) {
    return res.status(503).json({
      error: 'Database temporarily unavailable',
      message: 'Please check your internet connection and try again',
      code: 'DB_UNAVAILABLE'
    });
  }
  next();
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: isDbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Routes with database connection check
app.use('/api/auth', checkDbConnection, require('./routes/auth'));
app.use('/api/orders', checkDbConnection, require('./routes/orders'));
app.use('/api/editing', checkDbConnection, require('./routes/editing'));
app.use('/api/users', checkDbConnection, require('./routes/users'));
app.use('/api/clients', checkDbConnection, require('./routes/clients'));
app.use('/api/salary', checkDbConnection, require('./routes/salary'));
app.use('/api/transportation', checkDbConnection, require('./routes/transportation'));
app.use('/api/dashboard', checkDbConnection, require('./routes/dashboard'));

// Test endpoint to check database data
app.get('/api/test/data', async (req, res) => {
  try {
    const User = require('./models/User');
    const Order = require('./models/Order');
    const EditingProject = require('./models/EditingProject');
    const Client = require('./models/Client');
    
    const userCount = await User.countDocuments();
    const orderCount = await Order.countDocuments();
    const projectCount = await EditingProject.countDocuments();
    const clientCount = await Client.countDocuments();
    
    const sampleUsers = await User.find().limit(3).select('firstName lastName email shopName role');
    const sampleOrders = await Order.find().limit(3).select('description totalAmount shopName');
    
    res.json({
      counts: {
        users: userCount,
        orders: orderCount,
        projects: projectCount,
        clients: clientCount
      },
      samples: {
        users: sampleUsers,
        orders: sampleOrders
      }
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dashboard routes
app.get('/api/dashboard/alerts', async (req, res) => {
  try {
    const { shopName, userRole, userId } = req.query;
    
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    // Get orders ending today
    const Order = require('./models/Order');
    const EditingProject = require('./models/EditingProject');
    const mongoose = require('mongoose');
    
    let orderFilter = {
      completionDate: { $gte: todayStart, $lt: todayEnd }
    };
    
    let projectFilter = {
      endDate: { $gte: todayStart, $lt: todayEnd }
    };
    
    // Apply shop-based filtering
    if (shopName && userRole !== 'owner') {
      // For non-owners, filter by shop and their assignments
      if (userId && userId !== 'undefined' && mongoose.Types.ObjectId.isValid(userId)) {
        orderFilter = {
          ...orderFilter,
          shopName: shopName,
          $or: [
            { 'workers.worker': userId },
            { 'transporters.transporter': userId }
          ]
        };
        
        if (userRole === 'editor' || userRole === 'worker_editor') {
          projectFilter = {
            ...projectFilter,
            shopName: shopName,
            editor: userId
          };
        } else {
          // Non-editors don't see projects
          projectFilter = { _id: null };
        }
      } else {
        // Invalid userId, return no alerts
        orderFilter = { _id: null };
        projectFilter = { _id: null };
      }
    } else if (shopName && userRole === 'owner') {
      // For owners, get all from their shop
      orderFilter = { ...orderFilter, shopName: shopName };
      projectFilter = { ...projectFilter, shopName: shopName };
    }
    
    const ordersEndingToday = await Order.countDocuments(orderFilter);
    const projectsEndingToday = await EditingProject.countDocuments(projectFilter);
    
    const alerts = [];
    
    if (ordersEndingToday > 0) {
      alerts.push({
        type: 'urgent',
        title: 'Orders Ending Today',
        message: `${ordersEndingToday} orders are scheduled to complete today`,
        icon: 'fas fa-exclamation-triangle'
      });
    }
    
    if (projectsEndingToday > 0) {
      alerts.push({
        type: 'info',
        title: 'Editing Projects',
        message: `${projectsEndingToday} editing projects ending today`,
        icon: 'fas fa-video'
      });
    }
    
    if (alerts.length === 0) {
      alerts.push({
        type: 'info',
        title: 'All Clear',
        message: 'No urgent tasks for today',
        icon: 'fas fa-check-circle'
      });
    }
    
    res.json({ data: alerts });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.json({ data: [{ type: 'info', title: 'All Clear', message: 'No urgent tasks for today', icon: 'fas fa-check-circle' }] });
  }
});

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const { shopName, userRole, userId } = req.query;
    
    const Order = require('./models/Order');
    const EditingProject = require('./models/EditingProject');
    const User = require('./models/User');
    const mongoose = require('mongoose');
    
    let orderFilter = {};
    let projectFilter = {};
    let userFilter = {};
    
    // Apply shop-based filtering
    if (shopName && userRole !== 'owner') {
      // For non-owners, filter by shop and their assignments
      if (userId && userId !== 'undefined' && mongoose.Types.ObjectId.isValid(userId)) {
        orderFilter = {
          shopName: shopName,
          $or: [
            { 'workers.worker': userId },
            { 'transporters.transporter': userId }
          ]
        };
        
        if (userRole === 'editor' || userRole === 'worker_editor') {
          projectFilter = { 
            shopName: shopName,
            editor: userId 
          };
        } else {
          projectFilter = { _id: null }; // Non-editors don't see projects
        }
        
        userFilter = { _id: userId };
      } else {
        // Invalid userId, return zero stats
        orderFilter = { _id: null };
        projectFilter = { _id: null };
        userFilter = { _id: null };
      }
    } else if (shopName && userRole === 'owner') {
      // For owners, get all data from their shop
      orderFilter = { shopName: shopName };
      projectFilter = { shopName: shopName };
      userFilter = { shopName: shopName };
    }
    
    // Get order statistics
    const totalOrders = await Order.countDocuments(orderFilter);
    const completedOrders = await Order.countDocuments({ ...orderFilter, status: 'completed' });
    const remainingOrders = totalOrders - completedOrders;
    
    // Get payment statistics
    const orderPayments = await Order.aggregate([
      { $match: orderFilter },
      {
        $group: {
          _id: null,
          totalPayment: { $sum: '$totalAmount' },
          receivedPayment: { $sum: '$receivedPayment' }
        }
      }
    ]);
    
    // Get project statistics
    const totalProjects = await EditingProject.countDocuments(projectFilter);
    const completedProjects = await EditingProject.countDocuments({ ...projectFilter, status: 'completed' });
    const activeProjects = totalProjects - completedProjects;
    
    const projectPayments = await EditingProject.aggregate([
      { $match: projectFilter },
      {
        $group: {
          _id: null,
          totalProjectValue: { $sum: '$totalAmount' },
          totalCommissions: { $sum: '$commissionAmount' }
        }
      }
    ]);
    
    // Get worker payment statistics
    const workerPayments = await User.aggregate([
      { $match: userFilter },
      {
        $group: {
          _id: null,
          totalWorkerPayments: { $sum: '$remainingSalary' }
        }
      }
    ]);
    
    const orderStats = orderPayments[0] || { totalPayment: 0, receivedPayment: 0 };
    const projectStats = projectPayments[0] || { totalProjectValue: 0, totalCommissions: 0 };
    const workerStats = workerPayments[0] || { totalWorkerPayments: 0 };
    
    res.json({
      data: {
        remainingOrders,
        doneOrders: completedOrders,
        totalPayment: orderStats.totalPayment,
        receivedPayment: orderStats.receivedPayment,
        activeProjects,
        completedProjects,
        totalProjectValue: projectStats.totalProjectValue,
        totalCommissions: projectStats.totalCommissions,
        workerPayments: workerStats.totalWorkerPayments
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.json({
      data: {
        remainingOrders: 0,
        doneOrders: 0,
        totalPayment: 0,
        receivedPayment: 0,
        activeProjects: 0,
        completedProjects: 0,
        totalProjectValue: 0,
        totalCommissions: 0,
        workerPayments: 0
      }
    });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});