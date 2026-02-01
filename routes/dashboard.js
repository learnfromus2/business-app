const express = require('express');
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
    
    let alerts = [];
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    
    if (userRole === 'owner') {
      // Owner sees all business alerts
      let filter = {};
      if (shopName) {
        filter.shopName = shopName;
      }
      
      // Find orders ending today
      const ordersEndingToday = await Order.find({
        ...filter,
        $or: [
          { completionDate: { $gte: todayStart, $lte: todayEnd } },
          { orderDate: { $gte: todayStart, $lte: todayEnd } }
        ],
        status: { $ne: 'completed' }
      }).populate('client', 'name');
      
      // Find projects ending today
      const projectsEndingToday = await EditingProject.find({
        ...filter,
        endDate: { $gte: todayStart, $lte: todayEnd },
        status: { $ne: 'completed' }
      }).populate('client', 'name').populate('editor', 'firstName lastName');
      
      // Create alerts for orders
      if (ordersEndingToday.length > 0) {
        const orderNames = ordersEndingToday.map(order => 
          `"${order.orderName || 'Order #' + order._id.toString().slice(-6)}" (${order.client?.name || 'Unknown Client'})`
        ).join(', ');
        
        alerts.push({
          type: 'urgent',
          title: `${ordersEndingToday.length} Order${ordersEndingToday.length > 1 ? 's' : ''} Ending Today`,
          message: `Orders: ${orderNames}`,
          icon: 'fas fa-exclamation-triangle',
          count: ordersEndingToday.length
        });
      }
      
      // Create alerts for projects
      if (projectsEndingToday.length > 0) {
        const projectNames = projectsEndingToday.map(project => 
          `"${project.projectName}" (Editor: ${project.editor?.firstName} ${project.editor?.lastName})`
        ).join(', ');
        
        alerts.push({
          type: 'info',
          title: `${projectsEndingToday.length} Project${projectsEndingToday.length > 1 ? 's' : ''} Ending Today`,
          message: `Projects: ${projectNames}`,
          icon: 'fas fa-video',
          count: projectsEndingToday.length
        });
      }
      
      // Check for pending salary payments
      const pendingSalaries = await Salary.find({
        isPaid: false
      }).populate('employee', 'firstName lastName shopName');
      
      const shopPendingSalaries = pendingSalaries.filter(salary => 
        !shopName || salary.employee?.shopName === shopName
      );
      
      if (shopPendingSalaries.length > 0) {
        const totalPending = shopPendingSalaries.reduce((sum, salary) => sum + salary.amount, 0);
        alerts.push({
          type: 'urgent',
          title: 'Pending Salary Payments',
          message: `₹${totalPending.toLocaleString()} pending for ${shopPendingSalaries.length} employee${shopPendingSalaries.length > 1 ? 's' : ''}`,
          icon: 'fas fa-money-bill-wave',
          count: shopPendingSalaries.length
        });
      }
      
      // If no alerts, show a positive message
      if (alerts.length === 0) {
        alerts.push({
          type: 'info',
          title: 'All Clear!',
          message: 'No urgent tasks or deadlines for today',
          icon: 'fas fa-check-circle',
          count: 0
        });
      }
      
    } else {
      // Workers/Editors/Transporters see only their assigned work alerts
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      const userRole = user.role.toLowerCase();
      
      // Find orders where user is specifically assigned as worker or transporter
      const userOrders = await Order.find({
        $and: [
          {
            $or: [
              { 'workers.worker': userId },
              { 'transporters.transporter': userId }
            ]
          },
          {
            $or: [
              { completionDate: { $gte: todayStart, $lte: todayEnd } },
              { orderDate: { $gte: todayStart, $lte: todayEnd } }
            ]
          },
          { status: { $ne: 'completed' } }
        ]
      }).populate('client', 'name');
      
      // Find projects where user is specifically assigned as editor
      const userProjects = await EditingProject.find({
        editor: userId,
        endDate: { $gte: todayStart, $lte: todayEnd },
        status: { $ne: 'completed' }
      }).populate('client', 'name');
      
      // Create alerts only for assigned work
      if (userOrders.length > 0) {
        const orderNames = userOrders.map(order => {
          // Check if user is worker or transporter for this order
          const isWorker = order.workers.some(w => w.worker && w.worker.toString() === userId);
          const isTransporter = order.transporters.some(t => t.transporter && t.transporter.toString() === userId);
          const role = isWorker ? 'Worker' : 'Transporter';
          
          return `"${order.orderName || 'Order #' + order._id.toString().slice(-6)}" (${order.client?.name || 'Unknown Client'}) - Your role: ${role}`;
        }).join(', ');
        
        alerts.push({
          type: 'urgent',
          title: `Your ${userOrders.length} Assigned Order${userOrders.length > 1 ? 's' : ''} Due Today`,
          message: `Orders: ${orderNames}`,
          icon: 'fas fa-box',
          count: userOrders.length
        });
      }
      
      if (userProjects.length > 0) {
        const projectNames = userProjects.map(project => 
          `"${project.projectName}" (${project.client?.name || 'Unknown Client'}) - Your role: Editor`
        ).join(', ');
        
        alerts.push({
          type: 'info',
          title: `Your ${userProjects.length} Assigned Project${userProjects.length > 1 ? 's' : ''} Due Today`,
          message: `Projects: ${projectNames}`,
          icon: 'fas fa-video',
          count: userProjects.length
        });
      }
      
      // Check user's pending salary (only their own)
      const userSalaries = await Salary.find({
        employee: userId,
        isPaid: false
      });
      
      if (userSalaries.length > 0) {
        const totalPending = userSalaries.reduce((sum, salary) => sum + salary.amount, 0);
        alerts.push({
          type: 'info',
          title: 'Your Payment Ready',
          message: `Your salary of ₹${totalPending.toLocaleString()} is ready for collection`,
          icon: 'fas fa-money-bill-wave',
          count: userSalaries.length
        });
      }
      
      // If no assigned work alerts, show appropriate message
      if (alerts.length === 0) {
        // Check if user has any assigned work at all
        const allUserOrders = await Order.find({
          $or: [
            { 'workers.worker': userId },
            { 'transporters.transporter': userId }
          ]
        });
        
        const allUserProjects = await EditingProject.find({ editor: userId });
        
        if (allUserOrders.length === 0 && allUserProjects.length === 0) {
          alerts.push({
            type: 'info',
            title: 'No Assignments',
            message: 'You are not currently assigned to any orders or projects. Contact your manager for work assignments.',
            icon: 'fas fa-info-circle',
            count: 0
          });
        } else {
          alerts.push({
            type: 'info',
            title: 'Great Job!',
            message: 'No urgent assigned tasks for today. Keep up the good work!',
            icon: 'fas fa-thumbs-up',
            count: 0
          });
        }
      }
    }
    
    res.json({ data: alerts });
  } catch (error) {
    console.error('Error fetching dashboard alerts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const { shopName, userRole, userId } = req.query;
    
    let stats = {};
    
    if (userRole === 'owner') {
      // Owner sees business stats
      let filter = {};
      if (shopName) {
        filter.shopName = shopName;
      }
      
      // Get orders stats
      const orders = await Order.find(filter);
      const remainingOrders = orders.filter(order => order.status !== 'completed').length;
      const doneOrders = orders.filter(order => order.status === 'completed').length;
      const totalPayment = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
      const receivedPayment = orders.reduce((sum, order) => sum + (order.receivedPayment || 0), 0);
      
      // Get worker payments
      const salaries = await Salary.find({ isPaid: false }).populate('employee', 'shopName');
      const shopSalaries = salaries.filter(salary => 
        !shopName || salary.employee?.shopName === shopName
      );
      const workerPayments = shopSalaries.reduce((sum, salary) => sum + salary.amount, 0);
      
      // Get client payment information
      const clients = await Client.find(shopName ? { shopName } : {});
      const totalClientPaymentsDue = clients.reduce((sum, client) => sum + (client.totalPaymentsDue || 0), 0);
      const totalClientPaymentsReceived = clients.reduce((sum, client) => sum + (client.receivedPayments || 0), 0);
      const remainingClientPayments = totalClientPaymentsDue - totalClientPaymentsReceived;
      
      stats = {
        remainingOrders,
        doneOrders,
        totalPayment,
        receivedPayment,
        workerPayments,
        remainingClientPayments,
        totalClientPaymentsDue,
        totalClientPaymentsReceived
      };
    } else {
      // Workers/Editors/Transporters see only their assigned work stats
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Get user's assigned orders (where they are specifically assigned as worker or transporter)
      const userOrders = await Order.find({
        $or: [
          { 'workers.worker': userId },
          { 'transporters.transporter': userId }
        ]
      });
      
      // Get user's assigned projects (where they are specifically assigned as editor)
      const userProjects = await EditingProject.find({ editor: userId });
      
      const activeOrders = userOrders.filter(order => order.status !== 'completed').length;
      const completedOrders = userOrders.filter(order => order.status === 'completed').length;
      const activeProjects = userProjects.filter(project => project.status !== 'completed').length;
      const completedProjects = userProjects.filter(project => project.status === 'completed').length;
      
      // Get user's salary info (only their own earnings)
      const userSalaries = await Salary.find({ employee: userId });
      const totalEarnings = userSalaries.reduce((sum, salary) => sum + salary.amount, 0);
      const paidSalary = userSalaries.filter(s => s.isPaid).reduce((sum, salary) => sum + salary.amount, 0);
      const remainingSalary = totalEarnings - paidSalary;
      
      stats = {
        activeOrders,
        completedOrders,
        activeProjects,
        completedProjects,
        totalEarnings,
        paidSalary,
        remainingSalary,
        userRole: user.role
      };
    }
    
    res.json({ data: stats });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;