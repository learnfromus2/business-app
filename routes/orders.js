const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Client = require('../models/Client');
const User = require('../models/User');
const Salary = require('../models/Salary');
const router = express.Router();

// Function to automatically create salary entries from order
async function createSalaryEntriesFromOrder(order) {
  try {
    console.log('Creating salary entries for order:', order._id);
    
    // Create salary entries for workers
    for (const workerAssignment of order.workers) {
      if (workerAssignment.worker && workerAssignment.payment) {
        const salaryEntry = new Salary({
          employee: workerAssignment.worker,
          amount: workerAssignment.payment,
          salaryType: 'order_work',
          relatedOrder: order._id,
          description: `Order work: ${order.orderName || 'Order #' + order._id.toString().slice(-6)}`,
          workDate: order.orderDate || order.createdAt,
          isPaid: false, // Initially unpaid
          paidDate: null
        });

        await salaryEntry.save();
        
        // Update user's total earnings and remaining salary
        await User.findByIdAndUpdate(workerAssignment.worker, {
          $inc: { 
            totalEarnings: workerAssignment.payment,
            remainingSalary: workerAssignment.payment
          }
        });
        
        console.log(`Created salary entry for worker: ₹${workerAssignment.payment}`);
      }
    }

    // Create salary entries for transporters
    for (const transporterAssignment of order.transporters) {
      if (transporterAssignment.transporter && transporterAssignment.payment) {
        const salaryEntry = new Salary({
          employee: transporterAssignment.transporter,
          amount: transporterAssignment.payment,
          salaryType: 'transport_work',
          relatedOrder: order._id,
          description: `Transport work: ${order.orderName || 'Order #' + order._id.toString().slice(-6)}`,
          workDate: order.orderDate || order.createdAt,
          isPaid: false, // Initially unpaid
          paidDate: null
        });

        await salaryEntry.save();
        
        // Update user's total earnings and remaining salary
        await User.findByIdAndUpdate(transporterAssignment.transporter, {
          $inc: { 
            totalEarnings: transporterAssignment.payment,
            remainingSalary: transporterAssignment.payment
          }
        });
        
        console.log(`Created salary entry for transporter: ₹${transporterAssignment.payment}`);
      }
    }
    
    console.log('Salary entries created successfully for order');
  } catch (error) {
    console.error('Error creating salary entries from order:', error);
    throw error;
  }
}

// Simple test route
router.get('/test', (req, res) => {
  res.json({ message: 'Orders route is working!', timestamp: new Date() });
});

// Another test route for POST
router.post('/test', (req, res) => {
  res.json({ message: 'Orders POST is working!', body: req.body, timestamp: new Date() });
});

// Get all orders
router.get('/', async (req, res) => {
  try {
    const { shopName, userRole, userId } = req.query;
    
    console.log('Orders API called with:', { shopName, userRole, userId });
    
    let filter = {};
    let userObjectId = null; // Declare at the top level
    
    // Apply shop-based filtering
    if (shopName && userRole !== 'owner') {
      // For non-owners, filter by shop and their assignments
      if (!userId || userId === 'undefined') {
        console.log('No userId provided for non-owner');
        return res.json({ data: [] }); // Return empty array instead of error
      }
      
      // Handle both Firebase UID and MongoDB ObjectId
      if (mongoose.Types.ObjectId.isValid(userId)) {
        // Already a MongoDB ObjectId
        userObjectId = userId;
        console.log('Using MongoDB ObjectId directly:', userObjectId);
      } else {
        // Firebase UID - find user first
        console.log('Looking up Firebase UID:', userId);
        const user = await User.findOne({ firebaseUID: userId });
        if (!user) {
          console.log('User not found for Firebase UID:', userId);
          return res.json({ data: [] }); // Return empty array if user not found
        }
        userObjectId = user._id;
        console.log('Found user with MongoDB ObjectId:', userObjectId);
      }
      
      filter = {
        shopName: shopName,
        $or: [
          { 'workers.worker': userObjectId },
          { 'transporters.transporter': userObjectId }
        ]
      };
      
      console.log('Orders filter for non-owner:', JSON.stringify(filter, null, 2));
      
      // Debug: Let's also check what orders exist in the database
      const allOrders = await Order.find({ shopName: shopName })
        .populate('workers.worker', 'firstName lastName firebaseUID')
        .populate('transporters.transporter', 'firstName lastName firebaseUID')
        .select('orderName workers transporters');
      
      console.log('All orders in shop with worker/transporter details:');
      allOrders.forEach((order, index) => {
        console.log(`Order ${index + 1}: ${order.orderName}`);
        console.log('  Workers:', order.workers?.map(w => ({
          id: w.worker?._id?.toString(),
          name: w.worker ? `${w.worker.firstName} ${w.worker.lastName}` : 'Unknown',
          firebaseUID: w.worker?.firebaseUID
        })));
        console.log('  Transporters:', order.transporters?.map(t => ({
          id: t.transporter?._id?.toString(),
          name: t.transporter ? `${t.transporter.firstName} ${t.transporter.lastName}` : 'Unknown',
          firebaseUID: t.transporter?.firebaseUID
        })));
      });
      
      console.log(`Looking for user with ObjectId: ${userObjectId}`);
    } else if (shopName && userRole === 'owner') {
      // Owners see all orders from their shop
      filter = { shopName: shopName };
      console.log('Orders filter for owner:', JSON.stringify(filter, null, 2));
    }
    
    const orders = await Order.find(filter)
      .populate('client', 'name email phone')
      .populate('workers.worker', 'firstName lastName shopName')
      .populate('transporters.transporter', 'firstName lastName shopName')
      .sort({ createdAt: -1 });
    
    console.log(`Found ${orders.length} orders for user ${userId}`);
    
    // Debug: Try alternative query to see if we can find any matches
    if (userRole !== 'owner' && userObjectId) {
      console.log('Testing alternative queries...');
      
      // Test 1: Find orders where this user is in workers array
      const workerOrders = await Order.find({
        shopName: shopName,
        'workers.worker': userObjectId
      }).select('orderName workers');
      console.log(`Alternative query - Found ${workerOrders.length} orders as worker`);
      
      // Test 2: Find orders where this user is in transporters array
      const transporterOrders = await Order.find({
        shopName: shopName,
        'transporters.transporter': userObjectId
      }).select('orderName transporters');
      console.log(`Alternative query - Found ${transporterOrders.length} orders as transporter`);
      
      // Test 3: Find any orders with this user ID anywhere
      const anyOrders = await Order.find({
        shopName: shopName,
        $or: [
          { 'workers.worker': userObjectId },
          { 'transporters.transporter': userObjectId }
        ]
      }).select('orderName workers transporters');
      console.log(`Alternative query - Found ${anyOrders.length} orders with any match`);
    }
    
    // Debug: Show worker assignments for each order
    orders.forEach((order, index) => {
      console.log(`Order ${index + 1}: ${order.orderName || order.description}`);
      console.log('  Workers:', order.workers?.map(w => ({ id: w.worker?._id, name: w.worker ? `${w.worker.firstName} ${w.worker.lastName}` : 'Unknown' })));
      console.log('  Transporters:', order.transporters?.map(t => ({ id: t.transporter?._id, name: t.transporter ? `${t.transporter.firstName} ${t.transporter.lastName}` : 'Unknown' })));
    });
    
    res.json({ data: orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.json({ data: [] }); // Return empty array on error instead of 500
  }
});

// Create new order
router.post('/', async (req, res) => {
  try {
    console.log('Received order creation request:', req.body);
    
    const {
      clientId,
      orderName,
      venuePlace,
      products,
      workers,
      transporters,
      description,
      totalAmount,
      receivedPayment,
      orderDate,
      shopName,
      createdBy
    } = req.body;

    // Validate required fields
    if (!clientId || !orderName || !venuePlace || !totalAmount || !description || !shopName || !createdBy) {
      return res.status(400).json({ 
        message: 'Missing required fields: clientId, orderName, venuePlace, totalAmount, description, shopName, createdBy' 
      });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: 'Invalid client ID' });
    }

    // For createdBy, if it's not a valid ObjectId, create a default one
    let validCreatedBy = createdBy;
    if (!mongoose.Types.ObjectId.isValid(createdBy)) {
      console.log('Invalid createdBy ID, using default');
      validCreatedBy = new mongoose.Types.ObjectId();
    }

    // Validate workers array
    if (workers && workers.length > 0) {
      for (const worker of workers) {
        if (!mongoose.Types.ObjectId.isValid(worker.worker)) {
          return res.status(400).json({ message: `Invalid worker ID: ${worker.worker}` });
        }
      }
    }

    // Validate transporters array
    if (transporters && transporters.length > 0) {
      for (const transporter of transporters) {
        if (!mongoose.Types.ObjectId.isValid(transporter.transporter)) {
          return res.status(400).json({ message: `Invalid transporter ID: ${transporter.transporter}` });
        }
      }
    }

    const order = new Order({
      client: clientId,
      orderName: orderName,
      venuePlace: venuePlace,
      products: products || [{
        name: orderName,
        quantity: 1,
        price: totalAmount
      }],
      workers: workers || [],
      transporters: transporters || [],
      description,
      totalAmount: Number(totalAmount),
      receivedPayment: Number(receivedPayment) || 0,
      remainingPayment: Number(totalAmount) - (Number(receivedPayment) || 0),
      orderDate: orderDate ? new Date(orderDate) : new Date(),
      createdBy: validCreatedBy,
      shopName: shopName
    });

    console.log('Creating order with data:', order);

    await order.save();
    
    console.log('Order saved successfully:', order._id);
    
    // Automatically create salary entries for workers and transporters
    try {
      await createSalaryEntriesFromOrder(order);
    } catch (salaryError) {
      console.warn('Failed to create salary entries for order:', salaryError);
      // Don't fail the order creation if salary creation fails
    }
    
    // Update client statistics if client exists
    try {
      await Client.findByIdAndUpdate(clientId, {
        $inc: { 
          lifetimeOrders: 1,
          totalPaymentsDue: Number(totalAmount),
          pendingPayments: Number(totalAmount) - (Number(receivedPayment) || 0)
        }
      });
    } catch (clientUpdateError) {
      console.warn('Failed to update client statistics:', clientUpdateError);
      // Don't fail the order creation if client update fails
    }

    res.status(201).json({ message: 'Order created successfully', order });
  } catch (error) {
    console.error('Error creating order:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Update order status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        ...(status === 'completed' && { completionDate: new Date() })
      },
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Automatically mark related salary entries as paid when order is completed
    if (status === 'completed') {
      try {
        await markOrderSalariesAsPaid(order._id);
      } catch (salaryError) {
        console.warn('Failed to update salary status for completed order:', salaryError);
      }
    }
    
    res.json({ message: 'Order status updated', order });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update payment
router.put('/:id/payment', async (req, res) => {
  try {
    const { receivedPayment } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    order.receivedPayment = receivedPayment;
    order.remainingPayment = order.totalAmount - receivedPayment;
    await order.save();
    
    res.json({ message: 'Payment updated', order });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete order (owners only)
router.delete('/:id', async (req, res) => {
  try {
    const orderId = req.params.id;
    
    // Find the order first
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Delete related salary entries
    await Salary.deleteMany({ relatedOrder: orderId });
    console.log(`Deleted salary entries for order: ${orderId}`);
    
    // Update user earnings (subtract the amounts that were added)
    if (order.workers && order.workers.length > 0) {
      for (const workerAssignment of order.workers) {
        if (workerAssignment.worker && workerAssignment.payment) {
          await User.findByIdAndUpdate(workerAssignment.worker, {
            $inc: { 
              totalEarnings: -workerAssignment.payment,
              remainingSalary: -workerAssignment.payment
            }
          });
        }
      }
    }
    
    if (order.transporters && order.transporters.length > 0) {
      for (const transporterAssignment of order.transporters) {
        if (transporterAssignment.transporter && transporterAssignment.payment) {
          await User.findByIdAndUpdate(transporterAssignment.transporter, {
            $inc: { 
              totalEarnings: -transporterAssignment.payment,
              remainingSalary: -transporterAssignment.payment
            }
          });
        }
      }
    }
    
    // Update client statistics if client exists
    if (order.client) {
      await Client.findByIdAndUpdate(order.client, {
        $inc: { 
          lifetimeOrders: -1,
          totalPaymentsDue: -order.totalAmount,
          pendingPayments: -(order.totalAmount - order.receivedPayment)
        }
      });
    }
    
    // Delete the order
    await Order.findByIdAndDelete(orderId);
    
    res.json({ message: 'Order and related data deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Function to mark order-related salaries as paid
async function markOrderSalariesAsPaid(orderId) {
  try {
    console.log('Marking order salaries as paid for order:', orderId);
    
    // Find all salary entries related to this order
    const salaryEntries = await Salary.find({ 
      relatedOrder: orderId,
      isPaid: false 
    });
    
    const paidDate = new Date();
    
    // Mark each salary entry as paid
    for (const salary of salaryEntries) {
      salary.isPaid = true;
      salary.paidDate = paidDate;
      await salary.save();
      
      // Update user's paid salary and remaining salary
      await User.findByIdAndUpdate(salary.employee, {
        $inc: { 
          paidSalary: salary.amount,
          remainingSalary: -salary.amount
        },
        $push: {
          notifications: {
            message: `Salary of ₹${salary.amount} has been paid for completed order work.`,
            type: 'salary',
            isRead: false,
            createdAt: paidDate
          }
        }
      });
      
      console.log(`Marked salary as paid: ₹${salary.amount} for employee ${salary.employee}`);
    }
    
    console.log(`Marked ${salaryEntries.length} salary entries as paid`);
  } catch (error) {
    console.error('Error marking order salaries as paid:', error);
    throw error;
  }
}

module.exports = router;