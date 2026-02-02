const express = require('express');
const mongoose = require('mongoose');
const EditingProject = require('../models/EditingProject');
const Client = require('../models/Client');
const User = require('../models/User');
const Salary = require('../models/Salary');
const router = express.Router();

// Function to automatically create salary entries from editing project
async function createSalaryEntriesFromProject(project) {
  try {
    console.log('Creating salary entry for editing project:', project._id);
    
    // Create salary entry for editor
    if (project.editor && project.commissionAmount) {
      const salaryEntry = new Salary({
        employee: project.editor,
        amount: project.commissionAmount,
        salaryType: 'editing_work',
        relatedProject: project._id,
        description: `Editing project: ${project.projectName}`,
        workDate: project.startDate || project.createdAt,
        isPaid: false, // Initially unpaid
        paidDate: null
      });

      await salaryEntry.save();
      
      // Update user's total earnings and remaining salary
      await User.findByIdAndUpdate(project.editor, {
        $inc: { 
          totalEarnings: project.commissionAmount,
          remainingSalary: project.commissionAmount
        }
      });
      
      console.log(`Created salary entry for editor: ₹${project.commissionAmount}`);
    }
    
    console.log('Salary entry created successfully for editing project');
  } catch (error) {
    console.error('Error creating salary entry from project:', error);
    throw error;
  }
}

// Get all editing projects
router.get('/', async (req, res) => {
  try {
    const { shopName, userRole, userId } = req.query;
    
    console.log('Editing API called with:', { shopName, userRole, userId });
    
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
        editor: userObjectId
      };
      
      console.log('Editing filter for non-owner:', JSON.stringify(filter, null, 2));
    } else if (shopName && userRole === 'owner') {
      // Owners see all projects from their shop
      filter = { shopName: shopName };
      console.log('Editing filter for owner:', JSON.stringify(filter, null, 2));
    }
    
    const projects = await EditingProject.find(filter)
      .populate('client', 'name email phone')
      .populate('editor', 'firstName lastName shopName')
      .sort({ createdAt: -1 });
    
    console.log(`Found ${projects.length} projects for user ${userId}`);
    
    // Debug: Show editor assignments for each project
    projects.forEach((project, index) => {
      console.log(`Project ${index + 1}: ${project.projectName || project.description}`);
      console.log('  Editor:', { id: project.editor?._id, name: project.editor ? `${project.editor.firstName} ${project.editor.lastName}` : 'Unknown' });
    });
    
    res.json({ data: projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.json({ data: [] }); // Return empty array on error instead of 500
  }
});

// Create new editing project
router.post('/', async (req, res) => {
  try {
    console.log('Received project creation request:', req.body);
    
    const {
      clientId,
      editorId,
      projectName,
      description,
      totalAmount,
      commissionPercentage,
      startDate,
      endDate,
      receivedPayment,
      shopName,
      createdBy
    } = req.body;

    // Validate required fields
    if (!clientId || !editorId || !projectName || !description || !totalAmount || !commissionPercentage || !endDate || !shopName || !createdBy) {
      return res.status(400).json({ 
        message: 'Missing required fields: clientId, editorId, projectName, description, totalAmount, commissionPercentage, endDate, shopName, createdBy' 
      });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: 'Invalid client ID' });
    }

    if (!mongoose.Types.ObjectId.isValid(editorId)) {
      return res.status(400).json({ message: 'Invalid editor ID' });
    }

    if (!mongoose.Types.ObjectId.isValid(createdBy)) {
      return res.status(400).json({ message: 'Invalid createdBy ID' });
    }

    // Calculate commission amount
    const commissionAmount = Math.round((Number(totalAmount) * Number(commissionPercentage)) / 100);

    const project = new EditingProject({
      client: clientId,
      editor: editorId,
      projectName,
      description,
      totalAmount: Number(totalAmount),
      commissionPercentage: Number(commissionPercentage),
      commissionAmount: commissionAmount,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: new Date(endDate),
      receivedPayment: Number(receivedPayment) || 0,
      remainingPayment: Number(totalAmount) - (Number(receivedPayment) || 0),
      createdBy: createdBy,
      shopName: shopName
    });

    console.log('Creating project with data:', project);

    await project.save();
    
    console.log('Project saved successfully:', project._id);
    
    // Automatically create salary entry for editor
    try {
      await createSalaryEntriesFromProject(project);
    } catch (salaryError) {
      console.warn('Failed to create salary entry for project:', salaryError);
      // Don't fail the project creation if salary creation fails
    }
    
    // Update client statistics if client exists
    try {
      await Client.findByIdAndUpdate(clientId, {
        $inc: { 
          lifetimeEditingProjects: 1,
          totalPaymentsDue: Number(totalAmount),
          pendingPayments: Number(totalAmount) - (Number(receivedPayment) || 0)
        }
      });
    } catch (clientUpdateError) {
      console.warn('Failed to update client statistics:', clientUpdateError);
      // Don't fail the project creation if client update fails
    }

    res.status(201).json({ message: 'Project created successfully', project });
  } catch (error) {
    console.error('Error creating project:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Update project status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const project = await EditingProject.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        ...(status === 'completed' && { completionDate: new Date() })
      },
      { new: true }
    );
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Automatically mark related salary entry as paid when project is completed
    if (status === 'completed') {
      try {
        await markProjectSalaryAsPaid(project._id);
      } catch (salaryError) {
        console.warn('Failed to update salary status for completed project:', salaryError);
      }
    }
    
    res.json({ message: 'Project status updated', project });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update payment
router.put('/:id/payment', async (req, res) => {
  try {
    const { receivedPayment } = req.body;
    const project = await EditingProject.findById(req.params.id);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    project.receivedPayment = receivedPayment;
    project.remainingPayment = project.totalAmount - receivedPayment;
    await project.save();
    
    res.json({ message: 'Payment updated', project });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete project (owners only)
router.delete('/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    
    // Find the project first
    const project = await EditingProject.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Delete related salary entries
    await Salary.deleteMany({ relatedProject: projectId });
    console.log(`Deleted salary entries for project: ${projectId}`);
    
    // Update editor earnings (subtract the commission that was added)
    if (project.editor && project.commissionAmount) {
      await User.findByIdAndUpdate(project.editor, {
        $inc: { 
          totalEarnings: -project.commissionAmount,
          remainingSalary: -project.commissionAmount
        }
      });
    }
    
    // Update client statistics if client exists
    if (project.client) {
      await Client.findByIdAndUpdate(project.client, {
        $inc: { 
          lifetimeEditingProjects: -1,
          totalPaymentsDue: -project.totalAmount,
          pendingPayments: -(project.totalAmount - project.receivedPayment)
        }
      });
    }
    
    // Delete the project
    await EditingProject.findByIdAndDelete(projectId);
    
    res.json({ message: 'Project and related data deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Function to mark project-related salary as paid
async function markProjectSalaryAsPaid(projectId) {
  try {
    console.log('Marking project salary as paid for project:', projectId);
    
    // Find salary entry related to this project
    const salaryEntry = await Salary.findOne({ 
      relatedProject: projectId,
      isPaid: false 
    });
    
    if (salaryEntry) {
      const paidDate = new Date();
      
      salaryEntry.isPaid = true;
      salaryEntry.paidDate = paidDate;
      await salaryEntry.save();
      
      // Update user's paid salary and remaining salary
      await User.findByIdAndUpdate(salaryEntry.employee, {
        $inc: { 
          paidSalary: salaryEntry.amount,
          remainingSalary: -salaryEntry.amount
        },
        $push: {
          notifications: {
            message: `Commission of ₹${salaryEntry.amount} has been paid for completed editing project.`,
            type: 'salary',
            isRead: false,
            createdAt: paidDate
          }
        }
      });
      
      console.log(`Marked project salary as paid: ₹${salaryEntry.amount} for employee ${salaryEntry.employee}`);
    }
  } catch (error) {
    console.error('Error marking project salary as paid:', error);
    throw error;
  }
}

module.exports = router;