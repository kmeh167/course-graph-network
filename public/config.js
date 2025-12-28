const CONFIG = {
  // Use relative path since frontend and backend are on the same server
  API_BASE: window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api'  // Relative path for same-server deployment
};
