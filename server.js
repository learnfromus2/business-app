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

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/business_management', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/editing', require('./routes/editing'));
app.use('/api/users', require('./routes/users'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/salary', require('./routes/salary'));
app.use('/api/transportation', require('./routes/transportation'));
app.use('/api/dashboard', require('./routes/dashboard'));

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