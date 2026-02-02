const express = require('express');
const User = require('../models/User');
const Salary = require('../models/Salary');
const Order = require('../models/Order');
const EditingProject = require('../models/EditingProject');
const router = express.Router();

// Get all users
router.get('/', async (req, res) => {
  try {
    const { shopName, userRole, userId } = req.query;
    
    let filter = {};
    
    // Apply shop-based filtering
    if (shopName && userRole !== 'owner') {
      // Find user by Firebase UID to get MongoDB ObjectId
      const user = await User.findOne({ firebaseUID: userId });
      if (!user) {
        return res.json({ data: [] });
      }
      
      // Non-owners can only see users from their own shop (excluding themselves)
      filter = { 
        shopName: shopName,
        _id: { $ne: user._id }
      };
    } else if (shopName && userRole === 'owner') {
      // Owners see all users from their shop
      filter = { shopName: shopName };
    }
    
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json({ data: users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get workers
router.get('/workers', async (req, res) => {
  try {
    const { shopName, userRole } = req.query;
    
    let filter = {
      role: { $in: ['worker', 'worker_editor', 'transporter_worker'] }
    };
    
    // Apply shop-based filtering
    if (shopName) {
      filter.shopName = shopName;
    }
    
    const workers = await User.find(filter)
      .select('firstName lastName role shopName');
    
    res.json({ data: workers });
  } catch (error) {
    console.error('Error fetching workers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get editors
router.get('/editors', async (req, res) => {
  try {
    const { shopName, userRole } = req.query;
    
    let filter = {
      role: { $in: ['editor', 'worker_editor'] }
    };
    
    // Apply shop-based filtering
    if (shopName) {
      filter.shopName = shopName;
    }
    
    const editors = await User.find(filter)
      .select('firstName lastName role shopName');
    
    res.json({ data: editors });
  } catch (error) {
    console.error('Error fetching editors:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get transporters
router.get('/transporters', async (req, res) => {
  try {
    const { shopName, userRole } = req.query;
    
    let filter = {
      role: { $in: ['transporter', 'transporter_worker'] }
    };
    
    // Apply shop-based filtering
    if (shopName) {
      filter.shopName = shopName;
    }
    
    const transporters = await User.find(filter)
      .select('firstName lastName role shopName');
    
    res.json({ data: transporters });
  } catch (error) {
    console.error('Error fetching transporters:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get worker statistics
router.get('/:id/statistics', async (req, res) => {
  try {
    const { id } = req.params;
    const { shopName, userRole } = req.query;
    
    // Find the user
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check shop access
    if (shopName && userRole !== 'owner' && user.shopName !== shopName) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Get salary information
    const salaries = await Salary.find({ employee: id });
    const totalEarnings = salaries.reduce((sum, s) => sum + s.amount, 0);
    const paidSalary = salaries.filter(s => s.isPaid).reduce((sum, s) => sum + s.amount, 0);
    const remainingSalary = totalEarnings - paidSalary;
    
    // Count orders and projects
    let completedOrders = 0;
    let totalOrders = 0;
    let completedProjects = 0;
    let totalProjects = 0;
    
    // Count orders where user is a worker or transporter
    const orders = await Order.find({
      $or: [
        { 'workers.worker': id },
        { 'transporters.transporter': id }
      ]
    });
    
    totalOrders = orders.length;
    completedOrders = orders.filter(order => order.status === 'completed').length;
    
    // Count editing projects where user is the editor
    const projects = await EditingProject.find({ editor: id });
    totalProjects = projects.length;
    completedProjects = projects.filter(project => project.status === 'completed').length;
    
    // Calculate total work items
    const totalWork = totalOrders + totalProjects;
    const completedWork = completedOrders + completedProjects;
    const remainingWork = totalWork - completedWork;
    
    res.json({
      data: {
        user: {
          _id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role
        },
        orders: {
          total: totalOrders,
          completed: completedOrders,
          remaining: totalOrders - completedOrders
        },
        projects: {
          total: totalProjects,
          completed: completedProjects,
          remaining: totalProjects - completedProjects
        },
        work: {
          total: totalWork,
          completed: completedWork,
          remaining: remainingWork
        },
        payments: {
          totalEarnings,
          paidSalary,
          remainingSalary
        }
      }
    });
  } catch (error) {
    console.error('Error fetching worker statistics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user performance
router.put('/:id/performance', async (req, res) => {
  try {
    const { accuracyRating, promotionNotes } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { 
        accuracyRating,
        $push: {
          notifications: {
            message: promotionNotes ? `Performance updated: ${promotionNotes}` : 'Performance rating updated',
            type: 'promotion',
            isRead: false
          }
        }
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ message: 'Performance updated', user });
  } catch (error) {
    console.error('Error updating performance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;