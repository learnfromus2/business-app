const express = require('express');
const mongoose = require('mongoose');
const Salary = require('../models/Salary');
const User = require('../models/User');
const router = express.Router();

// Get all salaries
router.get('/', async (req, res) => {
  try {
    const { shopName, userRole, userId } = req.query;
    
    let filter = {};
    
    // If shopName is provided, filter by shop
    if (shopName && userRole !== 'owner') {
      // For non-owners, only show their own salary
      if (!userId || userId === 'undefined') {
        return res.json({ data: [] });
      }
      
      // Find user by Firebase UID to get MongoDB ObjectId
      const user = await User.findOne({ firebaseUID: userId });
      if (!user) {
        return res.json({ data: [] });
      }
      
      filter = { employee: user._id };
    }
    
    const salaries = await Salary.find(filter)
      .populate('employee', 'firstName lastName role shopName')
      .populate('relatedOrder', 'orderName totalAmount status')
      .populate('relatedProject', 'projectName totalAmount status')
      .sort({ createdAt: -1 });
    
    // Filter salaries by shop based on employee's shop
    let filteredSalaries = salaries;
    if (shopName) {
      filteredSalaries = salaries.filter(salary => {
        // Check if employee belongs to the same shop
        if (salary.employee && salary.employee.shopName === shopName) {
          return true;
        }
        return false;
      });
    }
    
    res.json({ data: filteredSalaries });
  } catch (error) {
    console.error('Error fetching salaries:', error);
    res.json({ data: [] }); // Return empty array on error
  }
});

// Get employee's salary
router.get('/my-salary', async (req, res) => {
  try {
    // In a real app, you'd get this from auth middleware
    const employeeId = req.query.employeeId;
    const { shopName, userRole } = req.query;
    
    if (!employeeId || employeeId === 'undefined') {
      return res.json({ data: { totalEarnings: 0, paidSalary: 0, remainingSalary: 0, salaries: [] } });
    }
    
    // Check if employeeId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.json({ data: { totalEarnings: 0, paidSalary: 0, remainingSalary: 0, salaries: [] } });
    }
    
    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.json({ data: { totalEarnings: 0, paidSalary: 0, remainingSalary: 0, salaries: [] } });
    }
    
    // Check if employee belongs to the same shop (unless owner)
    if (shopName && userRole !== 'owner' && employee.shopName !== shopName) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const salaries = await Salary.find({ employee: employeeId });
    
    const totalEarnings = salaries.reduce((sum, salary) => sum + salary.amount, 0);
    const paidSalary = salaries.filter(s => s.isPaid).reduce((sum, salary) => sum + salary.amount, 0);
    const remainingSalary = totalEarnings - paidSalary;
    
    res.json({
      data: {
        totalEarnings,
        paidSalary,
        remainingSalary,
        salaries
      }
    });
  } catch (error) {
    console.error('Error fetching employee salary:', error);
    res.json({ data: { totalEarnings: 0, paidSalary: 0, remainingSalary: 0, salaries: [] } });
  }
});

// Create salary entry
router.post('/', async (req, res) => {
  try {
    const {
      employeeId,
      amount,
      salaryType,
      relatedOrder,
      relatedProject,
      description
    } = req.body;
    
    const salary = new Salary({
      employee: employeeId,
      amount,
      salaryType,
      relatedOrder,
      relatedProject,
      description
    });
    
    await salary.save();
    
    // Update employee's total earnings
    await User.findByIdAndUpdate(employeeId, {
      $inc: { 
        totalEarnings: amount,
        remainingSalary: amount
      }
    });
    
    res.status(201).json({ message: 'Salary entry created', salary });
  } catch (error) {
    console.error('Error creating salary entry:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Pay salary
router.post('/pay', async (req, res) => {
  try {
    const { employeeId, amount, shopName, paidBy } = req.body;
    
    if (!employeeId || !amount) {
      return res.status(400).json({ message: 'Employee ID and amount are required' });
    }
    
    // Check if employeeId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: 'Invalid employee ID' });
    }
    
    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    // Check if employee belongs to the same shop
    if (shopName && employee.shopName !== shopName) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Find unpaid salary entries for this employee
    const unpaidSalaries = await Salary.find({ 
      employee: employeeId, 
      isPaid: false 
    }).sort({ createdAt: 1 }); // Oldest first
    
    let remainingAmount = amount;
    const paidSalaries = [];
    
    // Pay salaries in order until amount is exhausted
    for (const salary of unpaidSalaries) {
      if (remainingAmount <= 0) break;
      
      if (salary.amount <= remainingAmount) {
        // Pay this salary completely
        salary.isPaid = true;
        salary.paidDate = new Date();
        await salary.save();
        
        remainingAmount -= salary.amount;
        paidSalaries.push(salary);
      } else {
        // Partial payment - create a new paid entry and update the original
        const paidPortion = new Salary({
          employee: employeeId,
          amount: remainingAmount,
          salaryType: salary.salaryType,
          relatedOrder: salary.relatedOrder,
          relatedProject: salary.relatedProject,
          description: `Partial payment: ${salary.description}`,
          isPaid: true,
          paidDate: new Date()
        });
        await paidPortion.save();
        
        // Update original salary to reflect remaining amount
        salary.amount -= remainingAmount;
        await salary.save();
        
        paidSalaries.push(paidPortion);
        remainingAmount = 0;
      }
    }
    
    // Update employee's salary totals
    const totalPaidAmount = paidSalaries.reduce((sum, s) => sum + s.amount, 0);
    await User.findByIdAndUpdate(employeeId, {
      $inc: { 
        paidSalary: totalPaidAmount,
        remainingSalary: -totalPaidAmount
      },
      $push: {
        notifications: {
          message: `Salary of ₹${totalPaidAmount} has been paid. Please collect it.`,
          type: 'salary',
          isRead: false,
          createdAt: new Date()
        }
      }
    });
    
    res.json({ 
      message: 'Payment processed successfully', 
      paidAmount: totalPaidAmount,
      paidSalaries: paidSalaries.length
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Pay salary (legacy endpoint - keep for backward compatibility)
router.put('/:id/pay', async (req, res) => {
  try {
    const salary = await Salary.findById(req.params.id).populate('employee');
    
    if (!salary) {
      return res.status(404).json({ message: 'Salary entry not found' });
    }
    
    if (salary.isPaid) {
      return res.status(400).json({ message: 'Salary already paid' });
    }
    
    salary.isPaid = true;
    salary.paidDate = new Date();
    await salary.save();
    
    // Update employee's paid salary and remaining salary
    await User.findByIdAndUpdate(salary.employee._id, {
      $inc: { 
        paidSalary: salary.amount,
        remainingSalary: -salary.amount
      },
      $push: {
        notifications: {
          message: `Salary of ₹${salary.amount} has been paid. Please collect it.`,
          type: 'salary',
          isRead: false
        }
      }
    });
    
    res.json({ message: 'Salary paid successfully', salary });
  } catch (error) {
    console.error('Error paying salary:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Sync salary data from orders and projects
router.post('/sync', async (req, res) => {
  try {
    const { shopName } = req.body;
    
    console.log('Syncing salary data from orders and projects...');
    
    // Get all orders with worker and transporter payments for the shop
    const orders = await Order.find(shopName ? { shopName } : {})
      .populate('workers.worker', 'firstName lastName shopName')
      .populate('transporters.transporter', 'firstName lastName shopName');

    // Get all editing projects with editor payments for the shop
    const projects = await EditingProject.find(shopName ? { shopName } : {})
      .populate('editor', 'firstName lastName shopName');

    let syncedEntries = 0;

    // Process worker payments from orders
    for (const order of orders) {
      // Process workers
      for (const workerAssignment of order.workers) {
        if (workerAssignment.worker && workerAssignment.payment) {
          // Check if salary entry already exists
          const existingSalary = await Salary.findOne({
            employee: workerAssignment.worker._id,
            relatedOrder: order._id,
            salaryType: 'order_work'
          });

          if (!existingSalary) {
            const salaryEntry = new Salary({
              employee: workerAssignment.worker._id,
              amount: workerAssignment.payment,
              salaryType: 'order_work',
              relatedOrder: order._id,
              description: `Order work: ${order.orderName || 'Order #' + order._id.toString().slice(-6)}`,
              workDate: order.orderDate || order.createdAt,
              isPaid: order.status === 'completed',
              paidDate: order.status === 'completed' ? order.completionDate || new Date() : null
            });

            await salaryEntry.save();
            syncedEntries++;
          }
        }
      }

      // Process transporters
      for (const transporterAssignment of order.transporters) {
        if (transporterAssignment.transporter && transporterAssignment.payment) {
          // Check if salary entry already exists
          const existingSalary = await Salary.findOne({
            employee: transporterAssignment.transporter._id,
            relatedOrder: order._id,
            salaryType: 'transport_work'
          });

          if (!existingSalary) {
            const salaryEntry = new Salary({
              employee: transporterAssignment.transporter._id,
              amount: transporterAssignment.payment,
              salaryType: 'transport_work',
              relatedOrder: order._id,
              description: `Transport work: ${order.orderName || 'Order #' + order._id.toString().slice(-6)}`,
              workDate: order.orderDate || order.createdAt,
              isPaid: order.status === 'completed',
              paidDate: order.status === 'completed' ? order.completionDate || new Date() : null
            });

            await salaryEntry.save();
            syncedEntries++;
          }
        }
      }
    }

    // Process editor payments from projects
    for (const project of projects) {
      if (project.editor && project.commissionAmount) {
        // Check if salary entry already exists
        const existingSalary = await Salary.findOne({
          employee: project.editor._id,
          relatedProject: project._id,
          salaryType: 'editing_work'
        });

        if (!existingSalary) {
          const salaryEntry = new Salary({
            employee: project.editor._id,
            amount: project.commissionAmount,
            salaryType: 'editing_work',
            relatedProject: project._id,
            description: `Editing project: ${project.projectName}`,
            workDate: project.startDate || project.createdAt,
            isPaid: project.status === 'completed',
            paidDate: project.status === 'completed' ? project.completionDate || new Date() : null
          });

          await salaryEntry.save();
          syncedEntries++;
        }
      }
    }

    // Update user totals
    const users = await User.find(shopName ? { shopName } : {});
    for (const user of users) {
      const userSalaries = await Salary.find({ employee: user._id });
      
      const totalEarnings = userSalaries.reduce((sum, s) => sum + s.amount, 0);
      const paidSalary = userSalaries.filter(s => s.isPaid).reduce((sum, s) => sum + s.amount, 0);
      const remainingSalary = totalEarnings - paidSalary;

      await User.findByIdAndUpdate(user._id, {
        totalEarnings,
        paidSalary,
        remainingSalary
      });
    }

    res.json({ 
      message: 'Salary data synced successfully', 
      syncedEntries,
      ordersProcessed: orders.length,
      projectsProcessed: projects.length
    });
  } catch (error) {
    console.error('Error syncing salary data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;