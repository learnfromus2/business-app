const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Shop = require('../models/Shop');
const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      password, 
      shopName, 
      role, 
      phone,
      isCreatingShop,
      oldWorkerEditorId 
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create user data
    const userData = {
      firstName,
      lastName,
      email,
      shopName,
      role,
      phone: phone || ''
    };

    // Hash password only if provided (for non-Google users)
    if (password) {
      userData.password = await bcrypt.hash(password, 10);
    }

    // Handle old worker/editor reference
    if (oldWorkerEditorId) {
      if (role === 'editor') {
        userData.isFromWorker = true;
        userData.originalWorkerId = oldWorkerEditorId;
      } else if (role === 'worker') {
        userData.isFromEditor = true;
        userData.originalEditorId = oldWorkerEditorId;
      }
    }

    // Set profile as complete
    userData.profileComplete = true;

    const user = new User(userData);
    await user.save();

    res.status(201).json({ 
      message: 'User registered successfully',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        shopName: user.shopName,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if user has a password (non-Google users)
    if (!user.password) {
      return res.status(400).json({ message: 'Please use Google login for this account' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.json({
      message: 'Login successful',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        shopName: user.shopName,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get shops
router.get('/shops', async (req, res) => {
  try {
    // First try to get shops from Shop model
    let shops = await Shop.find({ isActive: true }).select('name');
    
    // If no shops exist, create default ones and get from users
    if (shops.length === 0) {
      const defaultShops = [
        { name: 'Creative Studios', businessType: 'video_editing' },
        { name: 'Event Productions', businessType: 'mixed' },
        { name: 'Digital Media House', businessType: 'video_editing' },
        { name: 'Wedding Films Co.', businessType: 'video_editing' },
        { name: 'LED Vision Pro', businessType: 'led_walls' },
        { name: 'Drone Masters', businessType: 'drones' }
      ];
      
      // Create default shops
      await Shop.insertMany(defaultShops);
      shops = await Shop.find({ isActive: true }).select('name');
    }
    
    // Also get unique shop names from existing users
    const userShops = await User.distinct('shopName');
    
    // Combine and deduplicate
    const allShopNames = new Set();
    shops.forEach(shop => allShopNames.add(shop.name));
    userShops.forEach(shopName => {
      if (shopName && shopName.trim()) {
        allShopNames.add(shopName);
      }
    });
    
    const shopList = Array.from(allShopNames).map(name => ({ name }));
    res.json(shopList);
  } catch (error) {
    console.error('Error fetching shops:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new shop
router.post('/shops', async (req, res) => {
  try {
    const { name, description, businessType, ownerEmail, ownerName } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Shop name is required' });
    }
    
    if (!ownerEmail || !ownerName) {
      return res.status(400).json({ message: 'Owner email and name are required' });
    }
    
    // Check if shop already exists
    const existingShop = await Shop.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
    });
    
    if (existingShop) {
      return res.status(409).json({ 
        message: 'Shop name already exists. Please choose a different name.',
        shopExists: true
      });
    }
    
    // Check if shop name exists in users collection (someone already created it)
    const existingUserShop = await User.findOne({ 
      shopName: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      role: 'owner'
    });
    
    if (existingUserShop) {
      return res.status(409).json({ 
        message: 'This shop already has an owner. Please choose a different shop name.',
        shopExists: true,
        existingOwner: existingUserShop.email
      });
    }
    
    // Create new shop
    const shop = new Shop({
      name: name.trim(),
      description: description || '',
      businessType: businessType || 'mixed',
      createdBy: ownerEmail
    });
    
    await shop.save();
    
    res.status(201).json({
      message: 'Shop created successfully',
      shop: {
        _id: shop._id,
        name: shop.name,
        description: shop.description,
        businessType: shop.businessType
      }
    });
  } catch (error) {
    console.error('Error creating shop:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get workers and editors for a shop
router.get('/workers-editors/:shopName', async (req, res) => {
  try {
    const { shopName } = req.params;
    const users = await User.find({
      shopName: decodeURIComponent(shopName),
      role: { $in: ['worker', 'editor', 'worker_editor'] }
    }).select('firstName lastName role');
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching workers/editors:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user by email (for Google auth check)
router.get('/user/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ email });
    
    if (user) {
      res.json({
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          shopName: user.shopName
        }
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;