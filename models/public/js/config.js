// API Configuration for Mobile App (Cordova WebView)
const API_CONFIG = {
    // Production server URL
    BASE_URL: 'https://manageroffice.onrender.com/api'
};

// Helper function to build API URLs
function getApiUrl(endpoint) {
    // Remove leading slash if present
    endpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    
    // Remove /api prefix if present (since it's in BASE_URL)
    endpoint = endpoint.startsWith('api/') ? endpoint.substring(4) : endpoint;
    
    return `${API_CONFIG.BASE_URL}/${endpoint}`;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { API_CONFIG, getApiUrl };
}
