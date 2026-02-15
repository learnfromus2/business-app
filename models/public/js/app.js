// Main Application JavaScript

// Global variables
let currentUser = null;

// Initialize application - this will be called after Firebase auth check
function initializeApp() {
    // Get user data from localStorage (set by Firebase auth)
    const userData = localStorage.getItem('user');
    
    if (!userData) {
        window.location.href = 'login.html';
        return;
    }
    
    try {
        currentUser = JSON.parse(userData);
        updateUserInfo();
        loadDashboard();
        setupEventListeners();
    } catch (error) {
        console.error('Error parsing user data:', error);
        logout();
    }
}

// Update user information in the UI
function updateUserInfo() {
    const userInfoElement = document.getElementById('userInfo');
    if (userInfoElement && currentUser) {
        userInfoElement.textContent = `${currentUser.firstName} ${currentUser.lastName} (${currentUser.role})`;
    }
    
    // Show appropriate dashboard based on user role
    if (currentUser.role === 'owner') {
        showOwnerDashboard();
    } else {
        showEmployeeDashboard();
    }
}

// Show owner dashboard
function showOwnerDashboard() {
    const ownerDashboard = document.getElementById('ownerDashboard');
    const employeeDashboard = document.getElementById('employeeDashboard');
    
    if (ownerDashboard) ownerDashboard.style.display = 'block';
    if (employeeDashboard) employeeDashboard.style.display = 'none';
}

// Show employee dashboard
function showEmployeeDashboard() {
    const ownerDashboard = document.getElementById('ownerDashboard');
    const employeeDashboard = document.getElementById('employeeDashboard');
    
    if (ownerDashboard) ownerDashboard.style.display = 'none';
    if (employeeDashboard) employeeDashboard.style.display = 'block';
    
    loadEmployeeDashboard();
}

// Load dashboard data
async function loadDashboard() {
    try {
        if (currentUser.role === 'owner') {
            await loadOwnerDashboard();
        } else {
            await loadEmployeeDashboard();
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showAlert('Error loading dashboard data', 'danger');
    }
}

// Load owner dashboard data
async function loadOwnerDashboard() {
    try {
        // Load alerts
        displayAlerts([
            {
                type: 'warning',
                title: 'Orders Ending Today',
                message: '3 orders are scheduled to complete today'
            },
            {
                type: 'info',
                title: 'Editing Projects',
                message: '2 editing projects ending today'
            }
        ]);
        
        // Load statistics
        updateDashboardStats({
            remainingOrders: 5,
            doneOrders: 12,
            totalPayment: 150000,
            receivedPayment: 100000,
            activeProjects: 3,
            completedProjects: 8,
            totalProjectValue: 200000,
            totalCommissions: 30000
        });
        
        // Load orders and projects based on current toggle
        const activeToggle = document.querySelector('input[name="businessToggle"]:checked');
        if (activeToggle && activeToggle.id === 'editingToggle') {
            await loadEditingProjects();
        } else {
            await loadOrders();
        }
        
    } catch (error) {
        console.error('Error loading owner dashboard:', error);
    }
}

// Load employee dashboard data
async function loadEmployeeDashboard() {
    try {
        // Load employee alerts
        displayEmployeeAlerts([
            {
                title: 'New Work Assignment',
                message: 'You have been assigned to Order #123',
                createdAt: new Date(),
                isRead: false
            }
        ]);
        
        // Load employee salary info
        updateEmployeeSalaryInfo({
            totalEarnings: 25000,
            remainingSalary: 15000
        });
        
        // Load employee works
        displayEmployeeWorks([
            {
                title: 'LED Wall Setup - Wedding Event',
                description: 'Setup LED walls for wedding ceremony',
                status: 'in_progress',
                payment: 5000
            }
        ]);
        
    } catch (error) {
        console.error('Error loading employee dashboard:', error);
    }
}

// Display alerts
function displayAlerts(alerts) {
    const alertsContainer = document.getElementById('todayAlerts');
    if (!alertsContainer) return;
    
    alertsContainer.innerHTML = '';
    
    if (alerts.length === 0) {
        alertsContainer.innerHTML = '<div class="alert alert-info"><i class="fas fa-info-circle"></i> No alerts for today</div>';
        return;
    }
    
    alerts.forEach(alert => {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${alert.type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            <i class="fas fa-${getAlertIcon(alert.type)}"></i>
            <strong>${alert.title}</strong><br>
            ${alert.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        alertsContainer.appendChild(alertDiv);
    });
}

// Display employee alerts
function displayEmployeeAlerts(alerts) {
    const alertsContainer = document.getElementById('employeeAlerts');
    if (!alertsContainer) return;
    
    alertsContainer.innerHTML = '';
    
    if (alerts.length === 0) {
        alertsContainer.innerHTML = '<div class="text-muted text-center">No new alerts</div>';
        return;
    }
    
    alerts.forEach(alert => {
        const alertDiv = document.createElement('div');
        alertDiv.className = `notification-item ${alert.isRead ? '' : 'unread'}`;
        alertDiv.innerHTML = `
            <div class="d-flex justify-content-between">
                <strong>${alert.title}</strong>
                <small class="text-muted">${formatDate(alert.createdAt)}</small>
            </div>
            <div>${alert.message}</div>
        `;
        alertsContainer.appendChild(alertDiv);
    });
}

// Update dashboard statistics
function updateDashboardStats(stats) {
    // Orders stats
    updateElementText('remainingOrdersCount', stats.remainingOrders || 0);
    updateElementText('doneOrdersCount', stats.doneOrders || 0);
    updateElementText('totalPayment', formatCurrency(stats.totalPayment || 0));
    updateElementText('receivedPayment', formatCurrency(stats.receivedPayment || 0));
    
    // Editing stats
    updateElementText('activeProjectsCount', stats.activeProjects || 0);
    updateElementText('completedProjectsCount', stats.completedProjects || 0);
    updateElementText('totalProjectValue', formatCurrency(stats.totalProjectValue || 0));
    updateElementText('totalCommissions', formatCurrency(stats.totalCommissions || 0));
}

// Update employee salary information
function updateEmployeeSalaryInfo(salaryInfo) {
    updateElementText('mySalary', formatCurrency(salaryInfo.totalEarnings || 0));
    updateElementText('remainingSalary', formatCurrency(salaryInfo.remainingSalary || 0));
}

// Display employee works
function displayEmployeeWorks(works) {
    const worksContainer = document.getElementById('myWorks');
    if (!worksContainer) return;
    
    worksContainer.innerHTML = '';
    
    if (works.length === 0) {
        worksContainer.innerHTML = '<div class="text-muted text-center">No work assigned</div>';
        return;
    }
    
    works.forEach(work => {
        const workDiv = document.createElement('div');
        workDiv.className = 'work-item mb-3 p-3 border rounded';
        workDiv.innerHTML = `
            <div class="d-flex justify-content-between">
                <strong>${work.title}</strong>
                <span class="status-badge status-${work.status}">${work.status}</span>
            </div>
            <div class="text-muted">${work.description}</div>
            <div class="mt-2">
                <small class="text-muted">Payment: ${formatCurrency(work.payment)}</small>
            </div>
        `;
        worksContainer.appendChild(workDiv);
    });
}

// Load orders
async function loadOrders() {
    try {
        // Mock data for now
        const orders = [
            {
                client: { name: 'ABC Events' },
                description: 'LED Wall setup for corporate event',
                orderDate: new Date(),
                status: 'pending',
                totalAmount: 50000
            },
            {
                client: { name: 'XYZ Productions' },
                description: 'Drone filming for wedding',
                orderDate: new Date(),
                status: 'completed',
                totalAmount: 30000
            }
        ];
        
        displayOrders(orders);
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

// Load editing projects
async function loadEditingProjects() {
    try {
        // Mock data for now
        const projects = [
            {
                projectName: 'Wedding Highlight Reel',
                client: { name: 'John & Jane Wedding' },
                editor: { firstName: 'Mike', lastName: 'Editor' },
                status: 'in_progress',
                totalAmount: 25000
            },
            {
                projectName: 'Corporate Video',
                client: { name: 'Tech Corp' },
                editor: { firstName: 'Sarah', lastName: 'Creative' },
                status: 'completed',
                totalAmount: 40000
            }
        ];
        
        displayEditingProjects(projects);
    } catch (error) {
        console.error('Error loading editing projects:', error);
    }
}

// Display orders
function displayOrders(orders) {
    const ordersContainer = document.getElementById('ordersList');
    if (!ordersContainer) return;
    
    ordersContainer.innerHTML = '';
    
    if (orders.length === 0) {
        ordersContainer.innerHTML = '<div class="text-muted text-center">No orders found</div>';
        return;
    }
    
    orders.forEach(order => {
        const orderDiv = document.createElement('div');
        orderDiv.className = 'order-card';
        orderDiv.innerHTML = `
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6>${order.client?.name || 'Unknown Client'}</h6>
                    <p class="text-muted mb-1">${order.description}</p>
                    <small class="text-muted">Date: ${formatDate(order.orderDate)}</small>
                </div>
                <div class="text-end">
                    <span class="status-badge status-${order.status}">${order.status}</span>
                    <div class="mt-2">
                        <strong>${formatCurrency(order.totalAmount)}</strong>
                    </div>
                </div>
            </div>
        `;
        ordersContainer.appendChild(orderDiv);
    });
}

// Display editing projects
function displayEditingProjects(projects) {
    const projectsContainer = document.getElementById('editingProjectsList');
    if (!projectsContainer) return;
    
    projectsContainer.innerHTML = '';
    
    if (projects.length === 0) {
        projectsContainer.innerHTML = '<div class="text-muted text-center">No projects found</div>';
        return;
    }
    
    projects.forEach(project => {
        const projectDiv = document.createElement('div');
        projectDiv.className = 'project-card';
        projectDiv.innerHTML = `
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6>${project.projectName}</h6>
                    <p class="text-muted mb-1">${project.client?.name || 'Unknown Client'}</p>
                    <small class="text-muted">Editor: ${project.editor?.firstName} ${project.editor?.lastName}</small>
                </div>
                <div class="text-end">
                    <span class="status-badge status-${project.status}">${project.status}</span>
                    <div class="mt-2">
                        <strong>${formatCurrency(project.totalAmount)}</strong>
                    </div>
                </div>
            </div>
        `;
        projectsContainer.appendChild(projectDiv);
    });
}

// Setup event listeners
function setupEventListeners() {
    // Business toggle listeners
    const businessToggles = document.querySelectorAll('input[name="businessToggle"]');
    businessToggles.forEach(toggle => {
        toggle.addEventListener('change', handleBusinessToggle);
    });
}

// Handle business toggle change
function handleBusinessToggle(event) {
    const ordersSection = document.getElementById('ordersSection');
    const editingSection = document.getElementById('editingSection');
    
    if (event.target.id === 'ordersToggle') {
        if (ordersSection) ordersSection.style.display = 'block';
        if (editingSection) editingSection.style.display = 'none';
        loadOrders();
    } else if (event.target.id === 'editingToggle') {
        if (ordersSection) ordersSection.style.display = 'none';
        if (editingSection) editingSection.style.display = 'block';
        loadEditingProjects();
    }
}

// Show modals
function showCreateClientModal() {
    console.log('Show create client modal');
}

function showSalaryManagement() {
    window.location.href = 'salary.html';
}

function showRemainingPayments() {
    console.log('Show remaining payments');
}

function showWorkerEditorPayments() {
    console.log('Show worker/editor payments');
}

function showCreateOrderModal() {
    window.location.href = 'orders.html';
}

function showCreateEditingModal() {
    window.location.href = 'editing.html';
}

// Utility functions
function updateElementText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    }
}

function formatCurrency(amount) {
    return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN');
}

function getAlertIcon(type) {
    const icons = {
        'info': 'info-circle',
        'warning': 'exclamation-triangle',
        'success': 'check-circle',
        'danger': 'exclamation-circle'
    };
    return icons[type] || 'info-circle';
}

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
}

// Logout function will be overridden in index.html to use Firebase