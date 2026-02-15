const express = require('express');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const Client = require('../models/Client');
const router = express.Router();

// Get all payments for an order
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const payments = await Payment.find({ order: orderId })
      .populate('receivedBy', 'firstName lastName role')
      .sort({ paymentDate: -1 });
    
    res.json({ data: payments });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all payments for a client
router.get('/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const payments = await Payment.find({ client: clientId })
      .populate('receivedBy', 'firstName lastName role')
      .populate('order', 'orderName orderDate')
      .sort({ paymentDate: -1 });
    
    res.json({ data: payments });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new payment record
router.post('/', async (req, res) => {
  try {
    const {
      orderId,
      clientId,
      amount,
      paymentDate,
      paymentMethod,
      receivedBy,
      notes,
      shopName
    } = req.body;

    // Validation
    if (!orderId || !clientId || !amount || !paymentDate || !receivedBy || !shopName) {
      return res.status(400).json({ 
        message: 'Missing required fields: orderId, clientId, amount, paymentDate, receivedBy, shopName' 
      });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: 'Invalid client ID' });
    }
    if (!mongoose.Types.ObjectId.isValid(receivedBy)) {
      return res.status(400).json({ message: 'Invalid receivedBy ID' });
    }

    // Create payment record
    const payment = new Payment({
      order: orderId,
      client: clientId,
      amount: Number(amount),
      paymentDate: new Date(paymentDate),
      paymentMethod: paymentMethod || 'cash',
      receivedBy: receivedBy,
      notes: notes || '',
      shopName: shopName
    });

    await payment.save();
    console.log('Payment record created:', payment._id);

    // Update order's receivedPayment
    const order = await Order.findById(orderId);
    if (order) {
      order.receivedPayment = (order.receivedPayment || 0) + Number(amount);
      order.remainingPayment = order.totalAmount - order.receivedPayment;
      await order.save();
      console.log('Order payment updated:', order._id);
    }

    // Update client's payment statistics
    const client = await Client.findById(clientId);
    if (client) {
      client.receivedPayments = (client.receivedPayments || 0) + Number(amount);
      client.pendingPayments = (client.totalPaymentsDue || 0) - client.receivedPayments;
      await client.save();
      console.log('Client payment stats updated:', client._id);
    }

    res.status(201).json({ 
      message: 'Payment recorded successfully', 
      payment: payment 
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// Delete payment record
router.delete('/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Update order's receivedPayment (subtract the amount)
    const order = await Order.findById(payment.order);
    if (order) {
      order.receivedPayment = Math.max(0, (order.receivedPayment || 0) - payment.amount);
      order.remainingPayment = order.totalAmount - order.receivedPayment;
      await order.save();
    }

    // Update client's payment statistics (subtract the amount)
    const client = await Client.findById(payment.client);
    if (client) {
      client.receivedPayments = Math.max(0, (client.receivedPayments || 0) - payment.amount);
      client.pendingPayments = (client.totalPaymentsDue || 0) - client.receivedPayments;
      await client.save();
    }

    // Delete the payment record
    await Payment.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
