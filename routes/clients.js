const express = require('express');
const Client = require('../models/Client');
const Order = require('../models/Order');
const EditingProject = require('../models/EditingProject');
const router = express.Router();

// Get all clients
router.get('/', async (req, res) => {
  try {
    const { shopName, userRole, userId } = req.query;
    
    let filter = {};
    
    // Apply shop-based filtering
    if (shopName && userRole !== 'owner') {
      // Non-owners cannot see clients
      return res.json({ data: [] });
    } else if (shopName && userRole === 'owner') {
      // Owners see clients from their shop
      filter = { shopName: shopName };
    }
    
    const clients = await Client.find(filter).sort({ createdAt: -1 });
    res.json({ data: clients });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new client
router.post('/', async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      address, 
      shopName,
      clientType,
      businessCategory,
      priorityLevel,
      notes
    } = req.body;
    
    const client = new Client({
      name,
      email: email || '', // Allow empty email
      phone,
      address,
      shopName: shopName,
      clientType: clientType || 'individual',
      businessCategory: businessCategory || 'mixed',
      priorityLevel: priorityLevel || 'normal',
      notes: notes || ''
    });
    
    await client.save();
    res.status(201).json({ message: 'Client created successfully', client });
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update client
router.put('/:id', async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { name, email, phone, address },
      { new: true }
    );
    
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    
    res.json({ message: 'Client updated successfully', client });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete client
router.delete('/:id', async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    
    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update client payment (owners only)
router.put('/:id/payment', async (req, res) => {
  try {
    const { receivedAmount, notes } = req.body;
    const clientId = req.params.id;
    
    // Find the client
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    
    // Validate received amount
    const totalDue = client.totalPaymentsDue || 0;
    const newReceivedAmount = parseFloat(receivedAmount) || 0;
    
    if (newReceivedAmount < 0) {
      return res.status(400).json({ message: 'Received amount cannot be negative' });
    }
    
    if (newReceivedAmount > totalDue) {
      return res.status(400).json({ message: 'Received amount cannot exceed total due amount' });
    }
    
    // Calculate new pending payments
    const newPendingPayments = Math.max(0, totalDue - newReceivedAmount);
    
    // Update client payment information
    client.receivedPayments = newReceivedAmount;
    client.pendingPayments = newPendingPayments;
    
    // Update payment status
    if (newPendingPayments === 0) {
      client.paymentStatus = 'paid';
    } else if (newReceivedAmount > 0) {
      client.paymentStatus = 'partial';
    } else {
      client.paymentStatus = 'pending';
    }
    
    // Add payment notes if provided
    if (notes) {
      if (!client.paymentHistory) {
        client.paymentHistory = [];
      }
      client.paymentHistory.push({
        date: new Date(),
        amount: newReceivedAmount,
        notes: notes,
        updatedBy: 'owner' // In a real app, this would be the actual user ID
      });
    }
    
    // Save the updated client
    await client.save();
    
    res.json({ 
      message: 'Client payment updated successfully', 
      client: {
        _id: client._id,
        name: client.name,
        totalPaymentsDue: client.totalPaymentsDue,
        receivedPayments: client.receivedPayments,
        pendingPayments: client.pendingPayments,
        paymentStatus: client.paymentStatus
      }
    });
  } catch (error) {
    console.error('Error updating client payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get client work history with payment details (owners only)
router.get('/:id/work-history', async (req, res) => {
  try {
    const clientId = req.params.id;
    
    console.log('Work history request for client:', clientId);
    
    // Validate ObjectId
    if (!clientId || !clientId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('Invalid client ID format:', clientId);
      return res.status(400).json({ message: 'Invalid client ID' });
    }
    
    // Find the client
    const client = await Client.findById(clientId);
    if (!client) {
      console.log('Client not found:', clientId);
      return res.status(404).json({ message: 'Client not found' });
    }
    
    console.log('Client found:', client.name);
    
    // Get all orders for this client (fetch complete documents)
    const orders = await Order.find({ client: clientId })
      .sort({ orderDate: -1 });
    
    console.log(`Found ${orders.length} orders for client`);
    
    // Get all editing projects for this client (fetch complete documents)
    const projects = await EditingProject.find({ client: clientId })
      .sort({ startDate: -1 });
    
    console.log(`Found ${projects.length} projects for client`);
    
    // Format work history
    const workHistory = [];
    
    // Add orders
    orders.forEach(order => {
      const workItem = {
        id: order._id,
        type: 'order',
        name: order.orderName || 'Unnamed Order',
        totalAmount: order.totalAmount || 0,
        receivedPayment: order.receivedPayment || 0,
        remainingPayment: order.remainingPayment || (order.totalAmount || 0),
        status: order.status || 'pending',
        date: order.orderDate || order.createdAt,
        isPaid: (order.receivedPayment || 0) >= (order.totalAmount || 0)
      };
      workHistory.push(workItem);
      console.log(`Added order: ${workItem.name} (${workItem.id})`);
    });
    
    // Add projects
    projects.forEach(project => {
      const workItem = {
        id: project._id,
        type: 'project',
        name: project.projectName || 'Unnamed Project',
        totalAmount: project.totalAmount || 0,
        receivedPayment: project.receivedPayment || 0,
        remainingPayment: project.remainingPayment || (project.totalAmount || 0),
        status: project.status || 'pending',
        date: project.startDate || project.createdAt,
        isPaid: (project.receivedPayment || 0) >= (project.totalAmount || 0)
      };
      workHistory.push(workItem);
      console.log(`Added project: ${workItem.name} (${workItem.id})`);
    });
    
    // Sort by date (newest first)
    workHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    console.log(`Returning ${workHistory.length} work items`);
    
    const response = { 
      client: {
        _id: client._id,
        name: client.name,
        totalPaymentsDue: client.totalPaymentsDue || 0,
        receivedPayments: client.receivedPayments || 0,
        pendingPayments: client.pendingPayments || 0
      },
      workHistory 
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching client work history:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message, stack: error.stack });
  }
});

// Mark specific work as paid
router.put('/:clientId/work/:workId/payment', async (req, res) => {
  try {
    const { clientId, workId } = req.params;
    const { workType, receivedAmount } = req.body;
    
    console.log('Payment update request:', { clientId, workId, workType, receivedAmount });
    
    // Validate input
    if (!clientId || !workId || !workType || receivedAmount === undefined) {
      console.log('Missing parameters:', { clientId: !!clientId, workId: !!workId, workType: !!workType, receivedAmount });
      return res.status(400).json({ message: 'Missing required parameters' });
    }
    
    // Validate ObjectIds
    if (!clientId.match(/^[0-9a-fA-F]{24}$/) || !workId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('Invalid ID format:', { clientId, workId });
      return res.status(400).json({ message: 'Invalid ID format' });
    }
    
    // Validate work type
    if (!['order', 'project'].includes(workType)) {
      console.log('Invalid work type:', workType);
      return res.status(400).json({ message: 'Invalid work type. Must be "order" or "project"' });
    }
    
    // Validate amount
    const amount = parseFloat(receivedAmount);
    if (isNaN(amount) || amount < 0) {
      console.log('Invalid amount:', receivedAmount, 'parsed:', amount);
      return res.status(400).json({ message: 'Invalid payment amount' });
    }
    
    let work;
    let updateResult;
    
    console.log(`Looking for ${workType} with ID: ${workId}`);
    
    if (workType === 'order') {
      // First check if order exists and get total amount for validation
      work = await Order.findById(workId);
      console.log('Order found:', !!work);
      if (!work) {
        return res.status(404).json({ message: 'Order not found' });
      }
      
      // Validate amount doesn't exceed total
      if (amount > work.totalAmount) {
        return res.status(400).json({ message: 'Payment amount cannot exceed total amount' });
      }
      
      console.log('Updating order payment:', { oldReceived: work.receivedPayment, newAmount: amount });
      
      // Update order payment using findByIdAndUpdate to avoid validation issues
      updateResult = await Order.findByIdAndUpdate(
        workId,
        {
          receivedPayment: amount,
          remainingPayment: work.totalAmount - amount
        },
        { new: true }
      );
      
    } else if (workType === 'project') {
      // First check if project exists and get total amount for validation
      work = await EditingProject.findById(workId);
      console.log('Project found:', !!work);
      if (!work) {
        return res.status(404).json({ message: 'Project not found' });
      }
      
      // Validate amount doesn't exceed total
      if (amount > work.totalAmount) {
        return res.status(400).json({ message: 'Payment amount cannot exceed total amount' });
      }
      
      console.log('Updating project payment:', { oldReceived: work.receivedPayment, newAmount: amount });
      
      // Update project payment using findByIdAndUpdate to avoid validation issues
      updateResult = await EditingProject.findByIdAndUpdate(
        workId,
        {
          receivedPayment: amount,
          remainingPayment: work.totalAmount - amount
        },
        { new: true }
      );
    }
    
    console.log('Work updated successfully, updating client totals...');
    
    // Update client's overall payment statistics
    const client = await Client.findById(clientId);
    if (client) {
      // Recalculate client totals
      const orders = await Order.find({ client: clientId });
      const projects = await EditingProject.find({ client: clientId });
      
      let totalDue = 0;
      let totalReceived = 0;
      
      orders.forEach(order => {
        totalDue += order.totalAmount || 0;
        totalReceived += order.receivedPayment || 0;
      });
      
      projects.forEach(project => {
        totalDue += project.totalAmount || 0;
        totalReceived += project.receivedPayment || 0;
      });
      
      console.log('Client totals calculated:', { totalDue, totalReceived });
      
      // Update client using findByIdAndUpdate to avoid validation issues
      await Client.findByIdAndUpdate(clientId, {
        totalPaymentsDue: totalDue,
        receivedPayments: totalReceived,
        pendingPayments: Math.max(0, totalDue - totalReceived),
        paymentStatus: totalDue === 0 ? 'pending' : 
                     totalReceived >= totalDue ? 'paid' : 
                     totalReceived > 0 ? 'partial' : 'pending'
      });
      
      console.log('Client updated successfully');
    }
    
    res.json({ 
      message: `${workType.charAt(0).toUpperCase() + workType.slice(1)} payment updated successfully`,
      work: {
        _id: updateResult._id,
        totalAmount: updateResult.totalAmount,
        receivedPayment: updateResult.receivedPayment,
        remainingPayment: updateResult.remainingPayment
      }
    });
  } catch (error) {
    console.error('Error updating work payment:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message, stack: error.stack });
  }
});

// Bulk payment update for multiple works
router.put('/:clientId/bulk-payment', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { payments } = req.body; // Array of { workId, workType, amount }
    
    console.log('Bulk payment update request:', { clientId, payments });
    
    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ message: 'No payments provided' });
    }
    
    const results = [];
    let totalUpdated = 0;
    
    // Process each payment
    for (const payment of payments) {
      try {
        const { workId, workType, amount } = payment;
        
        if (!workId || !workType || amount === undefined) {
          results.push({ workId, error: 'Missing required fields' });
          continue;
        }
        
        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount < 0) {
          results.push({ workId, error: 'Invalid amount' });
          continue;
        }
        
        let work;
        if (workType === 'order') {
          work = await Order.findById(workId);
          if (work && paymentAmount <= work.totalAmount) {
            await Order.findByIdAndUpdate(workId, {
              receivedPayment: paymentAmount,
              remainingPayment: work.totalAmount - paymentAmount
            });
            results.push({ workId, success: true, amount: paymentAmount });
            totalUpdated++;
          } else {
            results.push({ workId, error: work ? 'Amount exceeds total' : 'Order not found' });
          }
        } else if (workType === 'project') {
          work = await EditingProject.findById(workId);
          if (work && paymentAmount <= work.totalAmount) {
            await EditingProject.findByIdAndUpdate(workId, {
              receivedPayment: paymentAmount,
              remainingPayment: work.totalAmount - paymentAmount
            });
            results.push({ workId, success: true, amount: paymentAmount });
            totalUpdated++;
          } else {
            results.push({ workId, error: work ? 'Amount exceeds total' : 'Project not found' });
          }
        } else {
          results.push({ workId, error: 'Invalid work type' });
        }
      } catch (error) {
        results.push({ workId: payment.workId, error: error.message });
      }
    }
    
    // Update client totals if any payments were successful
    if (totalUpdated > 0) {
      const client = await Client.findById(clientId);
      if (client) {
        const orders = await Order.find({ client: clientId });
        const projects = await EditingProject.find({ client: clientId });
        
        let totalDue = 0;
        let totalReceived = 0;
        
        orders.forEach(order => {
          totalDue += order.totalAmount || 0;
          totalReceived += order.receivedPayment || 0;
        });
        
        projects.forEach(project => {
          totalDue += project.totalAmount || 0;
          totalReceived += project.receivedPayment || 0;
        });
        
        await Client.findByIdAndUpdate(clientId, {
          totalPaymentsDue: totalDue,
          receivedPayments: totalReceived,
          pendingPayments: Math.max(0, totalDue - totalReceived),
          paymentStatus: totalDue === 0 ? 'pending' : 
                       totalReceived >= totalDue ? 'paid' : 
                       totalReceived > 0 ? 'partial' : 'pending'
        });
      }
    }
    
    res.json({
      message: `Bulk payment update completed. ${totalUpdated} payments updated successfully.`,
      results,
      totalUpdated
    });
    
  } catch (error) {
    console.error('Error in bulk payment update:', error);
    res.status(500).json({ message: 'Server error during bulk payment update' });
  }
});

// Quick payment actions
router.put('/:clientId/quick-payment', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { action, amount } = req.body; // action: 'mark-all-paid', 'add-payment', 'clear-payments'
    
    console.log('Quick payment action:', { clientId, action, amount });
    
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    
    const orders = await Order.find({ client: clientId });
    const projects = await EditingProject.find({ client: clientId });
    
    let updatedCount = 0;
    
    if (action === 'mark-all-paid') {
      // Mark all orders and projects as fully paid
      for (const order of orders) {
        if (order.receivedPayment < order.totalAmount) {
          await Order.findByIdAndUpdate(order._id, {
            receivedPayment: order.totalAmount,
            remainingPayment: 0
          });
          updatedCount++;
        }
      }
      
      for (const project of projects) {
        if (project.receivedPayment < project.totalAmount) {
          await EditingProject.findByIdAndUpdate(project._id, {
            receivedPayment: project.totalAmount,
            remainingPayment: 0
          });
          updatedCount++;
        }
      }
      
    } else if (action === 'clear-payments') {
      // Clear all payments
      for (const order of orders) {
        if (order.receivedPayment > 0) {
          await Order.findByIdAndUpdate(order._id, {
            receivedPayment: 0,
            remainingPayment: order.totalAmount
          });
          updatedCount++;
        }
      }
      
      for (const project of projects) {
        if (project.receivedPayment > 0) {
          await EditingProject.findByIdAndUpdate(project._id, {
            receivedPayment: 0,
            remainingPayment: project.totalAmount
          });
          updatedCount++;
        }
      }
      
    } else if (action === 'add-payment' && amount) {
      // Distribute payment across unpaid works
      const paymentAmount = parseFloat(amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({ message: 'Invalid payment amount' });
      }
      
      let remainingAmount = paymentAmount;
      
      // First pay orders
      for (const order of orders) {
        if (remainingAmount <= 0) break;
        const unpaid = order.totalAmount - (order.receivedPayment || 0);
        if (unpaid > 0) {
          const payThis = Math.min(unpaid, remainingAmount);
          await Order.findByIdAndUpdate(order._id, {
            receivedPayment: (order.receivedPayment || 0) + payThis,
            remainingPayment: order.totalAmount - ((order.receivedPayment || 0) + payThis)
          });
          remainingAmount -= payThis;
          updatedCount++;
        }
      }
      
      // Then pay projects
      for (const project of projects) {
        if (remainingAmount <= 0) break;
        const unpaid = project.totalAmount - (project.receivedPayment || 0);
        if (unpaid > 0) {
          const payThis = Math.min(unpaid, remainingAmount);
          await EditingProject.findByIdAndUpdate(project._id, {
            receivedPayment: (project.receivedPayment || 0) + payThis,
            remainingPayment: project.totalAmount - ((project.receivedPayment || 0) + payThis)
          });
          remainingAmount -= payThis;
          updatedCount++;
        }
      }
    }
    
    // Update client totals
    let totalDue = 0;
    let totalReceived = 0;
    
    const updatedOrders = await Order.find({ client: clientId });
    const updatedProjects = await EditingProject.find({ client: clientId });
    
    updatedOrders.forEach(order => {
      totalDue += order.totalAmount || 0;
      totalReceived += order.receivedPayment || 0;
    });
    
    updatedProjects.forEach(project => {
      totalDue += project.totalAmount || 0;
      totalReceived += project.receivedPayment || 0;
    });
    
    await Client.findByIdAndUpdate(clientId, {
      totalPaymentsDue: totalDue,
      receivedPayments: totalReceived,
      pendingPayments: Math.max(0, totalDue - totalReceived),
      paymentStatus: totalDue === 0 ? 'pending' : 
                   totalReceived >= totalDue ? 'paid' : 
                   totalReceived > 0 ? 'partial' : 'pending'
    });
    
    res.json({
      message: `Quick payment action '${action}' completed successfully.`,
      updatedCount,
      client: {
        totalDue,
        totalReceived,
        pendingPayments: Math.max(0, totalDue - totalReceived)
      }
    });
    
  } catch (error) {
    console.error('Error in quick payment action:', error);
    res.status(500).json({ message: 'Server error during quick payment action' });
  }
});

module.exports = router;