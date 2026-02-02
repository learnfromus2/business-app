const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const EditingProject = require('../models/EditingProject');
const Client = require('../models/Client');
const User = require('../models/User');
const Salary = require('../models/Salary');
const router = express.Router();

// Get dashboard alerts
router.get('/alerts', async (req, res) => {
  try {
    const { shopName, userRole, userId } = req.query;
    
    console.log('Dashboard alerts called with:', { shopName, userRole, userId });
    
    let alerts = [];
    
    if (userRole === 'owner') {
      // Owner sees all business alerts
      try {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        
        // Get orders due today (using orderDate as deadline)
        const ordersEndingToday = await Order.find({
          shopName: shopName,
          orderDate: { 
            $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()), // Start of today
            $lte: today // End of today
          },
          status: { $ne: 'completed' }
        }).populate('client', 'name phone')
          .populate('workers.worker', 'firstName lastName')
          .populate('transporters.transporter', 'firstName lastName')
          .select('orderName description clientName orderDate totalAmount receivedPayment status venuePlace workers transporters');
        
        // Get projects ending today (using endDate as deadline)
        const projectsEndingToday = await EditingProject.find({
          shopName: shopName,
          endDate: { 
            $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()), // Start of today
            $lte: today // End of today
          },
          status: { $ne: 'completed' }
        }).populate('client', 'name phone')
          .populate('editor', 'firstName lastName')
          .select('projectName description clientName endDate totalAmount commissionAmount status editor');
        
        if (ordersEndingToday.length > 0) {
          const orderDetails = ordersEndingToday.map(order => {
            const clientName = order.client?.name || order.clientName || 'Unknown Client';
            const remainingAmount = (order.totalAmount || 0) - (order.receivedPayment || 0);
            
            // Get assigned team members
            const workers = order.workers?.map(w => w.worker ? `${w.worker.firstName} ${w.worker.lastName}` : 'Unknown Worker').join(', ') || 'No workers assigned';
            const transporters = order.transporters?.map(t => t.transporter ? `${t.transporter.firstName} ${t.transporter.lastName}` : 'Unknown Transporter').join(', ') || 'No transporters assigned';
            
            return `📦 ${order.orderName || order.description}
            👤 Client: ${clientName} | 📍 Venue: ${order.venuePlace || 'N/A'}
            💰 Remaining: ₹${remainingAmount.toLocaleString()}
            👷 Workers: ${workers}
            🚛 Transporters: ${transporters}
            📅 Due Today: ${new Date(order.orderDate).toLocaleDateString()}`;
          }).join('\n\n');
          
          alerts.push({
            type: 'urgent',
            title: `🚨 ${ordersEndingToday.length} Order${ordersEndingToday.length > 1 ? 's' : ''} Due Today`,
            message: orderDetails,
            icon: 'fas fa-exclamation-triangle',
            count: ordersEndingToday.length
          });
        }
        
        if (projectsEndingToday.length > 0) {
          const projectDetails = projectsEndingToday.map(project => {
            const clientName = project.client?.name || project.clientName || 'Unknown Client';
            const editorName = project.editor ? `${project.editor.firstName} ${project.editor.lastName}` : 'No editor assigned';
            
            return `🎬 ${project.projectName || project.description}
            👤 Client: ${clientName}
            💰 Value: ₹${(project.totalAmount || 0).toLocaleString()} | Commission: ₹${(project.commissionAmount || 0).toLocaleString()}
            🎥 Editor: ${editorName}
            📅 Deadline Today: ${new Date(project.endDate).toLocaleDateString()}`;
          }).join('\n\n');
          
          alerts.push({
            type: 'urgent',
            title: `🚨 ${projectsEndingToday.length} Project${projectsEndingToday.length > 1 ? 's' : ''} Ending Today`,
            message: projectDetails,
            icon: 'fas fa-video',
            count: projectsEndingToday.length
          });
        }
        
        // Add team coordination alert for owners to see all team members involved
        const allWorkEndingToday = [...ordersEndingToday, ...projectsEndingToday];
        if (allWorkEndingToday.length > 0) {
          const allTeamMembers = new Set();
          
          // Collect all team members involved in today's deadlines
          ordersEndingToday.forEach(order => {
            order.workers?.forEach(w => {
              if (w.worker) allTeamMembers.add(`👷 ${w.worker.firstName} ${w.worker.lastName} (Worker)`);
            });
            order.transporters?.forEach(t => {
              if (t.transporter) allTeamMembers.add(`🚛 ${t.transporter.firstName} ${t.transporter.lastName} (Transporter)`);
            });
          });
          
          projectsEndingToday.forEach(project => {
            if (project.editor) {
              allTeamMembers.add(`🎥 ${project.editor.firstName} ${project.editor.lastName} (Editor)`);
            }
          });
          
          if (allTeamMembers.size > 0) {
            const teamSummary = `Team members with deadlines today:\n\n${Array.from(allTeamMembers).join('\n')}\n\nMake sure to coordinate with your team to complete all work on time!`;
            
            alerts.push({
              type: 'info',
              title: `👥 Team Coordination (${allTeamMembers.size} members with deadlines)`,
              message: teamSummary,
              icon: 'fas fa-users',
              count: allTeamMembers.size
            });
          }
        }
        
      } catch (error) {
        console.error('Error fetching owner alerts:', error);
      }
    } else {
      // Workers/Editors/Transporters see only their assigned work
      try {
        let actualUserId = null;
        
        // Handle both Firebase UID and MongoDB ObjectId
        if (userId) {
          if (mongoose.Types.ObjectId.isValid(userId)) {
            // Already a MongoDB ObjectId
            actualUserId = userId;
          } else {
            // Firebase UID - find the corresponding MongoDB user
            const user = await User.findOne({ firebaseUID: userId });
            if (user) {
              actualUserId = user._id.toString();
            }
          }
        }
        
        if (actualUserId) {
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          
          console.log('Looking for alerts for user:', { originalUserId: userId, actualUserId, userRole });
          
          // Get user's orders due today (using orderDate as deadline)
          const userOrders = await Order.find({
            $or: [
              { 'workers.worker': actualUserId },
              { 'transporters.transporter': actualUserId }
            ],
            orderDate: { 
              $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()), // Start of today
              $lte: today // End of today
            },
            status: { $ne: 'completed' }
          }).populate('client', 'name phone')
            .populate('workers.worker', 'firstName lastName')
            .populate('transporters.transporter', 'firstName lastName')
            .select('orderName description clientName orderDate totalAmount venuePlace status workers transporters');
          
          console.log(`Found ${userOrders.length} orders due today for user ${actualUserId}`);
          
          // Get user's projects ending today (using endDate as deadline)
          const userProjects = await EditingProject.find({
            editor: actualUserId,
            endDate: { 
              $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()), // Start of today
              $lte: today // End of today
            },
            status: { $ne: 'completed' }
          }).populate('client', 'name phone')
            .populate('editor', 'firstName lastName')
            .select('projectName description clientName endDate totalAmount commissionAmount status editor');
          
          console.log(`Found ${userProjects.length} projects ending today for user ${actualUserId}`);
          
          if (userOrders.length > 0) {
            const orderDetails = userOrders.map(order => {
              const clientName = order.client?.name || order.clientName || 'Unknown Client';
              
              // Show all team members so user knows who else is working on this
              const allWorkers = order.workers?.map(w => w.worker ? `${w.worker.firstName} ${w.worker.lastName}` : 'Unknown Worker').join(', ') || 'No workers';
              const allTransporters = order.transporters?.map(t => t.transporter ? `${t.transporter.firstName} ${t.transporter.lastName}` : 'Unknown Transporter').join(', ') || 'No transporters';
              
              return `📦 ${order.orderName || order.description}
              � Client: ${clientName} | 📍 Venue: ${order.venuePlace || 'N/A'}
              👷 Team Workers: ${allWorkers}
              🚛 Team Transporters: ${allTransporters}
              📅 Due Today: ${new Date(order.orderDate).toLocaleDateString()}
              ⚠️ Your work is due today!`;
            }).join('\n\n');
            
            alerts.push({
              type: 'urgent',
              title: `🚨 Your ${userOrders.length} Order${userOrders.length > 1 ? 's' : ''} Ending Today`,
              message: orderDetails,
              icon: 'fas fa-box',
              count: userOrders.length
            });
          }
          
          if (userProjects.length > 0) {
            const projectDetails = userProjects.map(project => {
              const clientName = project.client?.name || project.clientName || 'Unknown Client';
              
              return `🎬 ${project.projectName || project.description}
              👤 Client: ${clientName}
              💰 Commission: ₹${(project.commissionAmount || 0).toLocaleString()}
              🎥 You are the assigned editor
              📅 Deadline Today: ${new Date(project.endDate).toLocaleDateString()}
              ⚠️ Project deadline is today!`;
            }).join('\n\n');
            
            alerts.push({
              type: 'urgent',
              title: `🚨 Your ${userProjects.length} Project${userProjects.length > 1 ? 's' : ''} Ending Today`,
              message: projectDetails,
              icon: 'fas fa-video',
              count: userProjects.length
            });
          }
        }
      } catch (error) {
        console.error('Error fetching user alerts:', error);
      }
    }
    
    // If no alerts, show a positive message
    if (alerts.length === 0) {
      alerts.push({
        type: 'info',
        title: 'All Good!',
        message: 'No urgent deadlines today. Keep up the great work!',
        icon: 'fas fa-check-circle',
        count: 0
      });
    }
    
    res.json({ data: alerts });
  } catch (error) {
    console.error('Dashboard alerts error:', error);
    res.status(500).json({ 
      data: [{
        type: 'urgent',
        title: 'System Error',
        message: 'Unable to load alerts. Please refresh the page.',
        icon: 'fas fa-exclamation-triangle',
        count: 0
      }]
    });
  }
});

// Get dashboard stats - SIMPLE VERSION
router.get('/stats', async (req, res) => {
  try {
    const { shopName, userRole, userId } = req.query;
    
    console.log('Dashboard stats called with:', { shopName, userRole, userId });
    
    let stats = {
      remainingOrders: 0,
      doneOrders: 0,
      totalPayment: 0,
      receivedPayment: 0,
      activeOrders: 0,
      completedOrders: 0,
      activeProjects: 0,
      completedProjects: 0,
      totalEarnings: 0,
      paidSalary: 0,
      remainingSalary: 0,
      remainingClientPayments: 0,
      workerPayments: 0,
      userRole: userRole || 'unknown'
    };
    
    if (userRole === 'owner') {
      // Owner sees business stats
      try {
        const orders = await Order.find(shopName ? { shopName } : {});
        const projects = await EditingProject.find(shopName ? { shopName } : {});
        const clients = await Client.find(shopName ? { shopName } : {});
        const salaries = await Salary.find(shopName ? { shopName } : {});
        
        stats.remainingOrders = orders.filter(o => o.status !== 'completed').length;
        stats.doneOrders = orders.filter(o => o.status === 'completed').length;
        stats.totalPayment = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        stats.receivedPayment = orders.reduce((sum, o) => sum + (o.receivedPayment || 0), 0);
        
        stats.activeProjects = projects.filter(p => p.status !== 'completed').length;
        stats.completedProjects = projects.filter(p => p.status === 'completed').length;
        
        // Calculate remaining client payments
        stats.remainingClientPayments = clients.reduce((sum, c) => {
          const totalWork = (c.totalOrderAmount || 0) + (c.totalProjectAmount || 0);
          const received = c.moneyReceived || 0;
          return sum + Math.max(0, totalWork - received);
        }, 0);
        
        // Calculate pending worker payments
        stats.workerPayments = salaries.filter(s => !s.isPaid).reduce((sum, s) => sum + s.amount, 0);
        
      } catch (error) {
        console.error('Error fetching owner stats:', error);
      }
    } else {
      // Worker/Editor/Transporter sees personal stats
      try {
        // Handle both Firebase UID and MongoDB ObjectId
        let userQuery = {};
        if (userId) {
          if (mongoose.Types.ObjectId.isValid(userId)) {
            // MongoDB ObjectId
            userQuery = { _id: userId };
          } else {
            // Firebase UID - find user first
            const user = await User.findOne({ firebaseUID: userId });
            if (user) {
              userQuery = { _id: user._id };
              userId = user._id.toString(); // Use MongoDB ID for queries
            }
          }
          
          if (userQuery._id) {
            // Get user's orders
            const userOrders = await Order.find({
              $or: [
                { 'workers.worker': userQuery._id },
                { 'transporters.transporter': userQuery._id }
              ]
            });
            
            // Get user's projects
            const userProjects = await EditingProject.find({ editor: userQuery._id });
            
            // Get user's salary
            const userSalaries = await Salary.find({ employee: userQuery._id });
            
            stats.activeOrders = userOrders.filter(o => o.status !== 'completed').length;
            stats.completedOrders = userOrders.filter(o => o.status === 'completed').length;
            stats.activeProjects = userProjects.filter(p => p.status !== 'completed').length;
            stats.completedProjects = userProjects.filter(p => p.status === 'completed').length;
            stats.totalEarnings = userSalaries.reduce((sum, s) => sum + s.amount, 0);
            stats.paidSalary = userSalaries.filter(s => s.isPaid).reduce((sum, s) => sum + s.amount, 0);
            stats.remainingSalary = stats.totalEarnings - stats.paidSalary;
          }
        }
      } catch (error) {
        console.error('Error fetching user stats:', error);
      }
    }
    
    res.json({ data: stats });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ data: stats });
  }
});

module.exports = router;