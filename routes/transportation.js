const express = require('express');
const mongoose = require('mongoose');
const Transportation = require('../models/Transportation');
const Order = require('../models/Order');
const EditingProject = require('../models/EditingProject');
const Client = require('../models/Client');
const User = require('../models/User');
const router = express.Router();

// Get all transportation records
router.get('/', async (req, res) => {
  try {
    const { shopName, userRole, userId } = req.query;
    
    console.log('Transportation API called with:', { shopName, userRole, userId });
    
    let filter = {};
    let orderFilter = {};
    let userObjectId = null;
    
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
        transporter: userObjectId
      };
      
      orderFilter = {
        shopName: shopName,
        'transporters.transporter': userObjectId
      };
      
      console.log('Transportation filter for non-owner:', JSON.stringify(filter, null, 2));
      console.log('Order filter for non-owner:', JSON.stringify(orderFilter, null, 2));
    } else if (shopName && userRole === 'owner') {
      // Owners see all transportation from their shop
      filter = { shopName: shopName };
      orderFilter = { shopName: shopName };
    } else {
      // No shop filter - return all (for testing)
      console.log('No shop filter applied');
    }
    
    console.log('Transportation filter:', filter);
    console.log('Order filter:', orderFilter);
    
    // Fetch both Transportation records and Order transporter assignments
    const [transports, orders] = await Promise.all([
      Transportation.find(filter)
        .populate('client', 'name email phone')
        .populate('transporter', 'firstName lastName shopName')
        .populate('relatedOrder', 'orderType totalAmount')
        .populate('relatedProject', 'projectName totalAmount')
        .sort({ createdAt: -1 }),
      
      Order.find(orderFilter)
        .populate('client', 'name email phone')
        .populate('transporters.transporter', 'firstName lastName shopName')
        .select('_id orderName venuePlace client transporters totalAmount orderDate status description shopName createdAt')
        .sort({ createdAt: -1 })
    ]);
    
    console.log(`Found ${transports.length} transportation records`);
    console.log(`Found ${orders.length} orders`);
    
    // Convert order transporter assignments to transportation format
    const orderTransports = [];
    orders.forEach(order => {
      if (order.transporters && order.transporters.length > 0) {
        console.log(`Processing order ${order._id} with ${order.transporters.length} transporters`);
        
        order.transporters.forEach(transporterAssignment => {
          // Only include if this transporter matches the user (for non-owners)
          if (userRole !== 'owner' && userObjectId && transporterAssignment.transporter && transporterAssignment.transporter._id.toString() !== userObjectId.toString()) {
            console.log(`Skipping transporter ${transporterAssignment.transporter._id} (not matching user ${userObjectId})`);
            return;
          }
          
          console.log(`Adding order transport for transporter:`, transporterAssignment.transporter ? transporterAssignment.transporter.firstName : 'Unknown');
          
          orderTransports.push({
            _id: `order-${order._id}-${transporterAssignment.transporter ? transporterAssignment.transporter._id : 'unknown'}`,
            relatedOrder: {
              _id: order._id,
              orderName: order.orderName,
              venuePlace: order.venuePlace,
              totalAmount: order.totalAmount,
              description: order.description
            },
            client: order.client,
            transporter: transporterAssignment.transporter,
            transportFee: transporterAssignment.payment,
            status: order.status === 'completed' ? 'delivered' : 
                   order.status === 'in_progress' ? 'in-transit' : 'pending',
            transportDate: order.orderDate,
            pickupLocation: 'Shop/Warehouse',
            deliveryLocation: order.venuePlace || 'Order Delivery Location',
            equipmentList: order.description || 'Order items',
            instructions: `Transport for Order: ${order.orderName || 'Unnamed Order'}`,
            shopName: order.shopName,
            createdAt: order.createdAt,
            isOrderTransport: true // Flag to identify this as an order transport
          });
        });
      }
    });
    
    console.log(`Created ${orderTransports.length} order transport records`);
    
    // Combine both types of transports
    const allTransports = [...transports, ...orderTransports];
    
    // Sort by creation date
    allTransports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    console.log(`Returning ${allTransports.length} total transport records`);
    
    res.json({ data: allTransports });
  } catch (error) {
    console.error('Error fetching transportation records:', error);
    console.error('Stack:', error.stack);
    res.json({ data: [] }); // Return empty array on error instead of 500
  }
});

// Create new transportation record
router.post('/', async (req, res) => {
  try {
    const {
      relatedOrder,
      relatedProject,
      clientId,
      transporterId,
      pickupLocation,
      deliveryLocation,
      distance,
      transportFee,
      equipmentList,
      transportDate,
      instructions,
      shopName,
      createdBy
    } = req.body;

    const transport = new Transportation({
      relatedOrder,
      relatedProject,
      client: clientId,
      transporter: transporterId,
      pickupLocation,
      deliveryLocation,
      distance: distance || 0,
      transportFee,
      equipmentList: equipmentList || '',
      transportDate: transportDate || new Date(),
      instructions: instructions || '',
      createdBy: createdBy || req.user?.id, // Use provided createdBy or fallback
      shopName: shopName
    });

    await transport.save();
    
    // Update client statistics if client is provided
    if (clientId) {
      await Client.findByIdAndUpdate(clientId, {
        $inc: { 
          lifetimeTransportations: 1,
          totalTransportationFees: transportFee
        }
      });
    }

    res.status(201).json({ message: 'Transportation record created successfully', transport });
  } catch (error) {
    console.error('Error creating transportation record:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update transportation status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const transport = await Transportation.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        ...(status === 'delivered' && { completedDate: new Date() })
      },
      { new: true }
    );
    
    if (!transport) {
      return res.status(404).json({ message: 'Transportation record not found' });
    }
    
    res.json({ message: 'Transportation status updated', transport });
  } catch (error) {
    console.error('Error updating transportation status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Assign transporter
router.put('/:id/assign', async (req, res) => {
  try {
    const { transporterId } = req.body;
    
    // Validate transporter exists and has correct role
    const transporter = await User.findById(transporterId);
    if (!transporter) {
      return res.status(404).json({ message: 'Transporter not found' });
    }
    
    if (!transporter.role.includes('transporter')) {
      return res.status(400).json({ message: 'User is not a transporter' });
    }
    
    const transport = await Transportation.findByIdAndUpdate(
      req.params.id,
      { transporter: transporterId },
      { new: true }
    );
    
    if (!transport) {
      return res.status(404).json({ message: 'Transportation record not found' });
    }
    
    res.json({ message: 'Transporter assigned successfully', transport });
  } catch (error) {
    console.error('Error assigning transporter:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;