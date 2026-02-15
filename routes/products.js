const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// Get all active products
router.get('/products', async (req, res) => {
  try {
    console.log('📦 Fetching all active products...');
    const products = await Product.find({ isActive: true }).sort({ name: 1 }).lean();
    console.log(`✅ Found ${products.length} active products`);
    res.json(products);
  } catch (error) {
    console.error('❌ Error fetching products:', error);
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
});

// Add new product (owner only)
router.post('/products', async (req, res) => {
  try {
    const { name, type } = req.body;
    
    console.log('📦 Creating new product:', { name, type });
    
    if (!name) {
      return res.status(400).json({ message: 'Product name is required' });
    }
    
    // Check if product already exists
    const existingProduct = await Product.findOne({ name: name.trim() });
    if (existingProduct) {
      return res.status(400).json({ message: 'Product already exists' });
    }
    
    const product = new Product({
      name: name.trim(),
      type: type || 'quantity',
      isActive: true
    });
    
    await product.save();
    console.log('✅ Product created successfully:', product);
    res.status(201).json(product);
  } catch (error) {
    console.error('❌ Error creating product:', error);
    res.status(500).json({ message: 'Error creating product', error: error.message });
  }
});

// Update product
router.put('/products/:id', async (req, res) => {
  try {
    const { name, type, isActive } = req.body;
    
    console.log('📦 Updating product:', req.params.id, { name, type, isActive });
    
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { name, type, isActive },
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    console.log('✅ Product updated successfully:', product);
    res.json(product);
  } catch (error) {
    console.error('❌ Error updating product:', error);
    res.status(500).json({ message: 'Error updating product', error: error.message });
  }
});

// Delete product (soft delete - set isActive to false)
router.delete('/products/:id', async (req, res) => {
  try {
    console.log('📦 Deactivating product:', req.params.id);
    
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    console.log('✅ Product deactivated successfully:', product);
    res.json({ message: 'Product deactivated successfully', product });
  } catch (error) {
    console.error('❌ Error deactivating product:', error);
    res.status(500).json({ message: 'Error deactivating product', error: error.message });
  }
});

// Initialize default products (run once)
router.post('/products/initialize', async (req, res) => {
  try {
    console.log('📦 Initializing default products...');
    
    const defaultProducts = [
      { name: 'LED', type: 'size' },
      { name: 'Mixer', type: 'quantity' },
      { name: 'Plasma', type: 'quantity' },
      { name: 'Drone', type: 'quantity' },
      { name: 'Camera', type: 'quantity' },
      { name: 'LED Flooring', type: 'size' },
      { name: 'Wireless', type: 'quantity' },
      { name: 'Youtube Live', type: 'quantity' }
    ];
    
    const results = [];
    for (const productData of defaultProducts) {
      const existing = await Product.findOne({ name: productData.name });
      if (!existing) {
        const product = new Product(productData);
        await product.save();
        results.push(product);
        console.log(`✅ Created product: ${productData.name}`);
      } else {
        console.log(`⏭️ Product already exists: ${productData.name}`);
      }
    }
    
    console.log(`✅ Initialization complete. Created ${results.length} new products.`);
    res.json({ 
      message: 'Products initialized successfully', 
      created: results.length,
      products: results 
    });
  } catch (error) {
    console.error('❌ Error initializing products:', error);
    res.status(500).json({ message: 'Error initializing products', error: error.message });
  }
});

module.exports = router;
