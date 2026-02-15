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
          .populate('workers.worker', 'firstName lastName phone')
          .populate('transporters.transporter', 'firstName lastName phone')
          .select('orderName description clientName orderDate totalAmount receivedPayment status venuePlace workers transporters')
          .lean();
        
        // Get projects ending today (using endDate as deadline)
        const projectsEndingToday = await EditingProject.find({
          shopName: shopName,
          endDate: { 
            $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()), // Start of today
            $lte: today // End of today
          },
          status: { $ne: 'completed' }
        }).populate('client', 'name phone')
          .populate('editor', 'firstName lastName phone')
          .select('projectName description clientName endDate totalAmount commissionAmount status editor')
          .lean();
        
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
        
        // TEAM COORDINATION ALERT - OWNERS ONLY (with phone numbers)
        const allWorkEndingToday = [...ordersEndingToday, ...projectsEndingToday];
        if (allWorkEndingToday.length > 0) {
          const teamMembersMap = new Map(); // Use Map to store unique members with their details
          
          console.log('👥 Building team coordination alert with phone numbers...');
          
          // Collect all team members involved in today's deadlines with phone numbers
          ordersEndingToday.forEach(order => {
            order.workers?.forEach(w => {
              if (w.worker) {
                const workerId = w.worker._id?.toString() || w.worker.toString();
                const phone = w.worker.phone || 'No phone number';
                const name = `${w.worker.firstName || 'Unknown'} ${w.worker.lastName || ''}`.trim();
                
                teamMembersMap.set(workerId, {
                  name: name,
                  role: 'Worker',
                  icon: '👷',
                  phone: phone
                });
              }
            });
            order.transporters?.forEach(t => {
              if (t.transporter) {
                const transporterId = t.transporter._id?.toString() || t.transporter.toString();
                const phone = t.transporter.phone || 'No phone number';
                const name = `${t.transporter.firstName || 'Unknown'} ${t.transporter.lastName || ''}`.trim();
                
                teamMembersMap.set(transporterId, {
                  name: name,
                  role: 'Transporter',
                  icon: '🚛',
                  phone: phone
                });
              }
            });
          });
          
          projectsEndingToday.forEach(project => {
            if (project.editor) {
              const editorId = project.editor._id?.toString() || project.editor.toString();
              const phone = project.editor.phone || 'No phone number';
              const name = `${project.editor.firstName || 'Unknown'} ${project.editor.lastName || ''}`.trim();
              
              teamMembersMap.set(editorId, {
                name: name,
                role: 'Editor',
                icon: '🎥',
                phone: phone
              });
            }
          });
          
          console.log(`📊 Total unique team members: ${teamMembersMap.size}`);
          
          if (teamMembersMap.size > 0) {
            // Format team members with phone numbers
            const teamList = Array.from(teamMembersMap.values()).map(member => 
              `${member.icon} ${member.name} (${member.role})
📱 ${member.phone}`
            ).join('\n\n');
            
            const teamSummary = `Team members with work ending today:\n\n${teamList}\n\n⚠️ Coordinate with your team to ensure all deadlines are met!`;
            
            console.log('✅ Team coordination alert created with phone numbers');
            
            alerts.push({
              type: 'info',
              title: `👥 Team Coordination Alert (${teamMembersMap.size} members)`,
              message: teamSummary,
              icon: 'fas fa-users',
              count: teamMembersMap.size
            });
          }
        }
        // END OF OWNER-ONLY TEAM COORDINATION ALERT
        
      } catch (error) {
        console.error('Error fetching owner alerts:', error);
      }
    } else {
      // Workers/Editors/Transporters see only their assigned work
      try {
        let actualUserId = null;
        let userObjectId = null;
        
        // Handle both Firebase UID and MongoDB ObjectId
        if (userId) {
          console.log('🔍 Processing userId:', userId, 'Type:', typeof userId);
          
          if (mongoose.Types.ObjectId.isValid(userId)) {
            // Already a MongoDB ObjectId string
            actualUserId = userId;
            try {
              userObjectId = new mongoose.Types.ObjectId(userId);
              console.log('✅ Created ObjectId from valid string:', userObjectId);
            } catch (err) {
              console.log('❌ Error creating ObjectId:', err);
              userObjectId = userId; // Fallback to string
            }
          } else {
            // Firebase UID - find the corresponding MongoDB user
            console.log('🔍 Looking up Firebase UID:', userId);
            const user = await User.findOne({ firebaseUID: userId });
            if (user) {
              actualUserId = user._id.toString();
              userObjectId = user._id; // This is already an ObjectId
              console.log('✅ Found user:', { actualUserId, userObjectId });
            } else {
              console.log('❌ No user found for Firebase UID:', userId);
            }
          }
        }
        
        console.log('🔑 Final User ID values:', { 
          originalUserId: userId, 
          actualUserId, 
          userObjectId: userObjectId?.toString(),
          userRole 
        });
        
        if (actualUserId) {
          const today = new Date();
          const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
          
          console.log('👤 Looking for alerts for user:', { originalUserId: userId, actualUserId, userRole });
          console.log('📅 Date range:', { startOfToday, endOfToday });
          
          // Get user's orders due today (using orderDate as deadline)
          const userOrders = await Order.find({
            $or: [
              { 'workers.worker': userObjectId },
              { 'transporters.transporter': userObjectId }
            ],
            orderDate: { 
              $gte: startOfToday,
              $lte: endOfToday
            },
            status: { $ne: 'completed' }
          }).populate('client', 'name phone')
            .populate('workers.worker', 'firstName lastName phone')
            .populate('transporters.transporter', 'firstName lastName phone')
            .select('orderName description clientName orderDate totalAmount venuePlace status workers transporters')
            .lean();
          
          console.log(`📦 Found ${userOrders.length} orders due today for user ${userObjectId}`);
          
          // Get user's projects ending today (using endDate as deadline) - for editors
          console.log('🔍 Searching for projects with editor ObjectId:', userObjectId);
          
          const userProjects = await EditingProject.find({
            editor: userObjectId,  // Use ObjectId directly since that's what the model expects
            endDate: { 
              $gte: startOfToday,
              $lte: endOfToday
            },
            status: { $ne: 'completed' }
          }).populate('client', 'name phone')
            .populate('editor', 'firstName lastName phone')
            .select('projectName description clientName endDate totalAmount commissionAmount status editor')
            .lean();
          
          console.log(`🎬 Found ${userProjects.length} projects ending today for editor ${userObjectId}`);
          
          if (userOrders.length > 0) {
            const orderDetails = userOrders.map(order => {
              const clientName = order.client?.name || order.clientName || 'Unknown Client';
              
              // Show all team members so user knows who else is working on this
              const allWorkers = order.workers?.map(w => w.worker ? `${w.worker.firstName} ${w.worker.lastName}` : 'Unknown Worker').join(', ') || 'No workers';
              const allTransporters = order.transporters?.map(t => t.transporter ? `${t.transporter.firstName} ${t.transporter.lastName}` : 'Unknown Transporter').join(', ') || 'No transporters';
              
              return `📦 ORDER: ${order.orderName || order.description || 'Unnamed Order'}
👤 Client: ${clientName}
📍 Venue: ${order.venuePlace || 'Not specified'}
👷 Team Workers: ${allWorkers}
🚛 Team Transporters: ${allTransporters}
📅 Due TODAY: ${new Date(order.orderDate).toLocaleDateString()}
⚠️ Your work must be completed today!`;
            }).join('\n\n');
            
            console.log(`✅ Created order alert for ${userOrders.length} orders`);
            
            alerts.push({
              type: 'urgent',
              title: `🚨 Your ${userOrders.length} Order${userOrders.length > 1 ? 's' : ''} Due Today`,
              message: orderDetails,
              icon: 'fas fa-box',
              count: userOrders.length
            });
          }
          
          if (userProjects.length > 0) {
            const projectDetails = userProjects.map(project => {
              const clientName = project.client?.name || project.clientName || 'Unknown Client';
              
              return `🎬 PROJECT: ${project.projectName || project.description || 'Unnamed Project'}
👤 Client: ${clientName}
💰 Your Commission: ₹${(project.commissionAmount || 0).toLocaleString()}
🎥 You are the assigned editor
📅 Deadline TODAY: ${new Date(project.endDate).toLocaleDateString()}
⚠️ Project must be completed today!`;
            }).join('\n\n');
            
            console.log(`✅ Created project alert for ${userProjects.length} projects`);
            
            alerts.push({
              type: 'urgent',
              title: `🚨 Your ${userProjects.length} Project${userProjects.length > 1 ? 's' : ''} Ending Today`,
              message: projectDetails,
              icon: 'fas fa-video',
              count: userProjects.length
            });
          }
          
          // TEAM COORDINATION ALERT - FOR WORKERS/EDITORS/TRANSPORTERS (with phone numbers)
          const userWorkEndingToday = [...userOrders, ...userProjects];
          if (userWorkEndingToday.length > 0) {
            const teamMembersMap = new Map();
            
            console.log('👥 Building team coordination alert for worker/editor/transporter...');
            
            // Collect all team members from user's orders
            userOrders.forEach(order => {
              order.workers?.forEach(w => {
                if (w.worker) {
                  const workerId = w.worker._id?.toString() || w.worker.toString();
                  const phone = w.worker.phone || 'No phone number';
                  const name = `${w.worker.firstName || 'Unknown'} ${w.worker.lastName || ''}`.trim();
                  
                  teamMembersMap.set(workerId, {
                    name: name,
                    role: 'Worker',
                    icon: '👷',
                    phone: phone
                  });
                }
              });
              order.transporters?.forEach(t => {
                if (t.transporter) {
                  const transporterId = t.transporter._id?.toString() || t.transporter.toString();
                  const phone = t.transporter.phone || 'No phone number';
                  const name = `${t.transporter.firstName || 'Unknown'} ${t.transporter.lastName || ''}`.trim();
                  
                  teamMembersMap.set(transporterId, {
                    name: name,
                    role: 'Transporter',
                    icon: '🚛',
                    phone: phone
                  });
                }
              });
            });
            
            // Collect editors from user's projects
            userProjects.forEach(project => {
              if (project.editor) {
                const editorId = project.editor._id?.toString() || project.editor.toString();
                const phone = project.editor.phone || 'No phone number';
                const name = `${project.editor.firstName || 'Unknown'} ${project.editor.lastName || ''}`.trim();
                
                teamMembersMap.set(editorId, {
                  name: name,
                  role: 'Editor',
                  icon: '🎥',
                  phone: phone
                });
              }
            });
            
            if (teamMembersMap.size > 0) {
              // Format team members with phone numbers
              const teamList = Array.from(teamMembersMap.values()).map(member => 
                `${member.icon} ${member.name} (${member.role})
📱 ${member.phone}`
              ).join('\n\n');
              
              const teamSummary = `Your team members for today's work:\n\n${teamList}\n\n⚠️ Coordinate with your team to complete all work on time!`;
              
              console.log('✅ Team coordination alert created for worker/editor/transporter');
              
              alerts.push({
                type: 'info',
                title: `👥 Your Team Today (${teamMembersMap.size} members)`,
                message: teamSummary,
                icon: 'fas fa-users',
                count: teamMembersMap.size
              });
            }
          }
          
          console.log(`📊 Total alerts for user: ${alerts.length}`);
        } else {
          console.log('❌ No valid user ID found for alerts');
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