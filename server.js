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
    
    const sampleUsers = await User.find().limit(3).select('firstName lastName email shopName role firebaseUID');
    const sampleOrders = await Order.find().limit(3).select('description totalAmount shopName workers transporters');
    
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

// Debug endpoint to check user assignments
app.get('/api/debug/assignments/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { shopName } = req.query;
    
    const User = require('./models/User');
    const Order = require('./models/Order');
    const EditingProject = require('./models/EditingProject');
    
    console.log('=== DEBUGGING USER ASSIGNMENTS ===');
    console.log('Input userId:', userId);
    console.log('Input shopName:', shopName);
    
    // Step 1: Find the user
    let user = null;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
      console.log('Found user by MongoDB ID:', user ? `${user.firstName} ${user.lastName}` : 'Not found');
    } else {
      user = await User.findOne({ firebaseUID: userId });
      console.log('Found user by Firebase UID:', user ? `${user.firstName} ${user.lastName}` : 'Not found');
    }
    
    if (!user) {
      return res.json({ error: 'User not found', userId });
    }
    
    const userObjectId = user._id;
    console.log('User ObjectId:', userObjectId);
    
    // Step 2: Find all orders in the shop
    const allOrders = await Order.find({ shopName })
      .populate('workers.worker', 'firstName lastName firebaseUID')
      .populate('transporters.transporter', 'firstName lastName firebaseUID');
    
    console.log(`Found ${allOrders.length} total orders in shop`);
    
    // Step 3: Check which orders have this user assigned
    const userOrders = [];
    allOrders.forEach(order => {
      let isAssigned = false;
      let role = [];
      
      // Check workers
      order.workers?.forEach(w => {
        if (w.worker && w.worker._id.toString() === userObjectId.toString()) {
          isAssigned = true;
          role.push('worker');
        }
      });
      
      // Check transporters
      order.transporters?.forEach(t => {
        if (t.transporter && t.transporter._id.toString() === userObjectId.toString()) {
          isAssigned = true;
          role.push('transporter');
        }
      });
      
      if (isAssigned) {
        userOrders.push({
          orderId: order._id,
          orderName: order.orderName,
          roles: role,
          workers: order.workers?.map(w => ({
            id: w.worker?._id,
            name: w.worker ? `${w.worker.firstName} ${w.worker.lastName}` : 'Unknown'
          })),
          transporters: order.transporters?.map(t => ({
            id: t.transporter?._id,
            name: t.transporter ? `${t.transporter.firstName} ${t.transporter.lastName}` : 'Unknown'
          }))
        });
      }
    });
    
    // Step 4: Test the actual query
    const queryResult = await Order.find({
      shopName: shopName,
      $or: [
        { 'workers.worker': userObjectId },
        { 'transporters.transporter': userObjectId }
      ]
    });
    
    console.log(`Query found ${queryResult.length} orders`);
    
    // Step 5: Check projects
    const allProjects = await EditingProject.find({ shopName })
      .populate('editor', 'firstName lastName firebaseUID');
    
    const userProjects = allProjects.filter(project => 
      project.editor && project.editor._id.toString() === userObjectId.toString()
    );
    
    res.json({
      user: {
        _id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        firebaseUID: user.firebaseUID
      },
      assignments: {
        totalOrdersInShop: allOrders.length,
        assignedOrders: userOrders.length,
        assignedOrderDetails: userOrders,
        queryFoundOrders: queryResult.length,
        totalProjectsInShop: allProjects.length,
        assignedProjects: userProjects.length,
        assignedProjectDetails: userProjects.map(p => ({
          projectId: p._id,
          projectName: p.projectName,
          editor: p.editor ? `${p.editor.firstName} ${p.editor.lastName}` : 'Unknown'
        }))
      }
    });
    
  } catch (error) {
    console.error('Debug assignments error:', error);
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/test/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const User = require('./models/User');
    
    console.log('Testing user lookup for:', userId);
    
    // Try both Firebase UID and MongoDB ObjectId lookup
    const firebaseUser = await User.findOne({ firebaseUID: userId });
    const mongoUser = mongoose.Types.ObjectId.isValid(userId) ? await User.findById(userId) : null;
    
    res.json({
      userId,
      isValidObjectId: mongoose.Types.ObjectId.isValid(userId),
      firebaseUser: firebaseUser ? {
        _id: firebaseUser._id,
        name: `${firebaseUser.firstName} ${firebaseUser.lastName}`,
        email: firebaseUser.email,
        role: firebaseUser.role,
        shopName: firebaseUser.shopName,
        firebaseUID: firebaseUser.firebaseUID
      } : null,
      mongoUser: mongoUser ? {
        _id: mongoUser._id,
        name: `${mongoUser.firstName} ${mongoUser.lastName}`,
        email: mongoUser.email,
        role: mongoUser.role,
        shopName: mongoUser.shopName,
        firebaseUID: mongoUser.firebaseUID
      } : null
    });
  } catch (error) {
    console.error('User lookup test error:', error);
    res.status(500).json({ error: error.message });
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