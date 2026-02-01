// Global Error Handler for Database Connection Issues
// Include this script in all HTML pages

// Enhanced error handling for API calls
async function makeApiCall(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // Handle specific database connection errors
            if (response.status === 503 && errorData.code === 'DB_UNAVAILABLE') {
                showDatabaseError();
                throw new Error('Database temporarily unavailable');
            }
            
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        
        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showNetworkError();
        }
        
        throw error;
    }
}

// Show database connection error
function showDatabaseError() {
    const alertContainer = document.getElementById('alertContainer') || document.body;
    
    // Remove existing database error alerts
    const existingAlerts = alertContainer.querySelectorAll('.db-error-alert');
    existingAlerts.forEach(alert => alert.remove());
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-warning alert-dismissible fade show db-error-alert';
    errorDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; min-width: 400px; max-width: 90vw;';
    errorDiv.innerHTML = `
        <i class="fas fa-database me-2"></i>
        <strong>Database Connection Issue</strong><br>
        <small>The database is temporarily unavailable. Please:</small><br>
        <small>1. Check your internet connection</small><br>
        <small>2. Refresh the page in a few moments</small><br>
        <small>3. Contact support if the issue persists</small>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    alertContainer.appendChild(errorDiv);
    
    // Auto-remove after 15 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 15000);
}

// Show network error
function showNetworkError() {
    const alertContainer = document.getElementById('alertContainer') || document.body;
    
    // Remove existing network error alerts
    const existingAlerts = alertContainer.querySelectorAll('.network-error-alert');
    existingAlerts.forEach(alert => alert.remove());
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger alert-dismissible fade show network-error-alert';
    errorDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; min-width: 400px; max-width: 90vw;';
    errorDiv.innerHTML = `
        <i class="fas fa-wifi me-2"></i>
        <strong>Network Connection Error</strong><br>
        <small>Unable to connect to the server. Please check your internet connection and try again.</small>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    alertContainer.appendChild(errorDiv);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 10000);
}

// Check server health
async function checkServerHealth() {
    try {
        const response = await fetch('/api/health');
        const health = await response.json();
        
        if (!health.database) {
            showDatabaseError();
        }
        
        return health;
    } catch (error) {
        showNetworkError();
        return { status: 'error', database: false };
    }
}

// Initialize error handling when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Check server health on page load
    checkServerHealth();
    
    // Set up periodic health checks (every 5 minutes)
    setInterval(checkServerHealth, 5 * 60 * 1000);
});

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    
    if (event.reason && event.reason.message) {
        if (event.reason.message.includes('Database temporarily unavailable')) {
            showDatabaseError();
        } else if (event.reason.message.includes('fetch')) {
            showNetworkError();
        }
    }
});