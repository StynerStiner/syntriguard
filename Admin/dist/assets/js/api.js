/**
 * SyntriGuard API Client
 * Shared across all frontend pages — handles auth, API calls, and token management.
 */
const SyntriGuard = (function() {

  const API_BASE = '/api';

  // ─── Token Management ───
  function getToken() {
    return localStorage.getItem('sg_token');
  }

  function setToken(token) {
    localStorage.setItem('sg_token', token);
  }

  function getUser() {
    const user = localStorage.getItem('sg_user');
    return user ? JSON.parse(user) : null;
  }

  function setUser(user) {
    localStorage.setItem('sg_user', JSON.stringify(user));
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function logout() {
    localStorage.removeItem('sg_token');
    localStorage.removeItem('sg_user');
    window.location.href = '/login';
  }

  // Redirect to login if not authenticated (call on protected pages)
  function requireAuth() {
    if (!isLoggedIn()) {
      window.location.href = '/login';
      return false;
    }
    return true;
  }

  // ─── API Fetch Helper ───
  async function apiCall(endpoint, options = {}) {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      ...options.headers
    };

    const response = await fetch(API_BASE + endpoint, {
      ...options,
      headers
    });

    // Handle 401 — token expired (but don't redirect if we're on the login page)
    if (response.status === 401) {
      if (!window.location.pathname.includes('auth-login')) {
        logout();
      }
      throw new Error('Invalid credentials');
    }

    // For PDF downloads, return the blob
    if (options.responseType === 'blob') {
      return response.blob();
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    return data;
  }

  // ─── Auth ───
  async function login(email, password) {
    const data = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data && data.token) {
      setToken(data.token);
      setUser(data.user);
    }
    return data;
  }

  // ─── Dashboard ───
  async function getDashboardStats() {
    return apiCall('/dashboard/stats');
  }

  // ─── Guards ───
  async function getGuards() {
    return apiCall('/guards');
  }

  async function getGuard(id) {
    return apiCall('/guards/' + id);
  }

  async function createGuard(data) {
    return apiCall('/guards', { method: 'POST', body: JSON.stringify(data) });
  }

  async function updateGuard(id, data) {
    return apiCall('/guards/' + id, { method: 'PUT', body: JSON.stringify(data) });
  }

  async function deleteGuard(id) {
    return apiCall('/guards/' + id, { method: 'DELETE' });
  }

  // ─── Shifts ───
  async function getShifts(start, end) {
    let url = '/shifts';
    if (start && end) url += '?start=' + start + '&end=' + end;
    return apiCall(url);
  }

  async function createShift(data) {
    return apiCall('/shifts', { method: 'POST', body: JSON.stringify(data) });
  }

  async function updateShift(id, data) {
    return apiCall('/shifts/' + id, { method: 'PUT', body: JSON.stringify(data) });
  }

  async function deleteShift(id) {
    return apiCall('/shifts/' + id, { method: 'DELETE' });
  }

  async function getShiftRevisions(id) {
    return apiCall('/shifts/' + id + '/revisions');
  }

  // ─── Sites ───
  async function getSites() {
    return apiCall('/sites');
  }

  async function createSite(data) {
    return apiCall('/sites', { method: 'POST', body: JSON.stringify(data) });
  }

  async function updateSite(id, data) {
    return apiCall('/sites/' + id, { method: 'PUT', body: JSON.stringify(data) });
  }

  async function deleteSite(id) {
    return apiCall('/sites/' + id, { method: 'DELETE' });
  }

  // ─── Clients ───
  async function getClients() {
    return apiCall('/clients');
  }

  async function createClient(data) {
    return apiCall('/clients', { method: 'POST', body: JSON.stringify(data) });
  }

  async function updateClient(id, data) {
    return apiCall('/clients/' + id, { method: 'PUT', body: JSON.stringify(data) });
  }

  async function deleteClient(id) {
    return apiCall('/clients/' + id, { method: 'DELETE' });
  }

  // ─── Incidents ───
  async function getIncidents() {
    return apiCall('/incidents');
  }

  async function createIncident(data) {
    return apiCall('/incidents', { method: 'POST', body: JSON.stringify(data) });
  }

  async function updateIncidentStatus(id, status) {
    return apiCall('/incidents/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status }) });
  }

  // ─── Messages ───
  async function getConversation(userId) {
    return apiCall('/messages/conversation/' + userId);
  }

  async function sendMessage(receiverId, content) {
    return apiCall('/messages', { method: 'POST', body: JSON.stringify({ receiver_id: receiverId, content }) });
  }

  async function getUnreadCount() {
    return apiCall('/messages/unread/count');
  }

  // ─── AI ───
  async function aiChat(message, conversationId) {
    return apiCall('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversation_id: conversationId || null })
    });
  }

  async function getAIConversations() {
    return apiCall('/ai/conversations');
  }

  async function generateSchedule(startDate, endDate, instructions) {
    return apiCall('/ai/generate-schedule', {
      method: 'POST',
      body: JSON.stringify({ start_date: startDate, end_date: endDate, instructions })
    });
  }

  // ─── Users ───
  async function getUsers() {
    return apiCall('/users');
  }

  async function createUser(data) {
    return apiCall('/users', { method: 'POST', body: JSON.stringify(data) });
  }

  // ─── Exports ───
  async function syncScheduleSheet(month) {
    return apiCall('/sheets/schedule/sync', { method: 'POST', body: JSON.stringify({ month }) });
  }

  async function exportRosterSheet() {
    return apiCall('/sheets/roster', { method: 'POST', body: JSON.stringify({}) });
  }

  async function exportIncidentsSheet() {
    return apiCall('/sheets/incidents', { method: 'POST', body: JSON.stringify({}) });
  }

  function downloadPDF(type, params) {
    // Opens PDF in new tab — browser handles download
    const token = getToken();
    let url = API_BASE + '/pdf/' + type;
    if (params) url += '?' + new URLSearchParams(params).toString();
    // We need to pass auth — open via fetch and create blob URL
    fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
      .then(r => r.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = type + '.pdf';
        a.click();
        URL.revokeObjectURL(blobUrl);
      });
  }

  // ─── WhatsApp ───
  async function sendWhatsApp(guardId, message) {
    return apiCall('/whatsapp/send', { method: 'POST', body: JSON.stringify({ guard_id: guardId, message }) });
  }

  // ─── Public API ───
  return {
    // Auth
    login, logout, isLoggedIn, requireAuth, getToken, getUser,
    // Dashboard
    getDashboardStats,
    // Guards
    getGuards, getGuard, createGuard, updateGuard, deleteGuard,
    // Shifts
    getShifts, createShift, updateShift, deleteShift, getShiftRevisions,
    // Sites & Clients
    getSites, createSite, updateSite, deleteSite,
    getClients, createClient, updateClient, deleteClient,
    // Incidents
    getIncidents, createIncident, updateIncidentStatus,
    // Messages
    getConversation, sendMessage, getUnreadCount,
    // AI
    aiChat, getAIConversations, generateSchedule,
    // Users
    getUsers, createUser,
    // Exports
    syncScheduleSheet, exportRosterSheet, exportIncidentsSheet, downloadPDF,
    // WhatsApp
    sendWhatsApp
  };

})();

// ─── Quick Action — navigates to AI assistant with a prompt ───
window.sgQuickAction = function(prompt) {
  sessionStorage.setItem('sg_quick_prompt', prompt);
  window.location.href = '/ai-assistant';
};

// ─── Auto-initialize on every page ───
document.addEventListener('DOMContentLoaded', function() {
  // Check if this is a public page (login, register, etc.)
  var path = window.location.pathname;
  var isPublicPage = path.includes('auth-login') || path === '/login' || path.includes('auth-register') || path === '/register' ||
    path.includes('auth-recoverpw') || path.includes('auth-createpw') ||
    path.includes('auth-confirm') || path.includes('auth-lock') ||
    path.includes('error-');

  // If not a public page and not logged in, redirect to login
  if (!isPublicPage && !SyntriGuard.isLoggedIn()) {
    window.location.href = '/login';
    return;
  }

  // Load user profile into topbar
  var user = SyntriGuard.getUser();
  if (user) {
    var nameEl = document.getElementById('topbar-user-name');
    if (nameEl) nameEl.textContent = user.name || 'Admin';

    var avatarEl = document.getElementById('topbar-user-avatar');
    if (avatarEl) {
      avatarEl.src = user.avatar_url || 'https://pub-bb4fc0a4a29548cc9136a6cdb4882573.r2.dev/founder-headshot/raoulstiner.png';
    }
  }

  // Wire sign out button
  var signOutBtn = document.getElementById('btn-sign-out');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      SyntriGuard.logout();
    });
  }

  // Load live notifications into the bell dropdown
  if (SyntriGuard.isLoggedIn()) {
    loadLiveNotifications();
  }
});

async function loadLiveNotifications() {
  try {
    var token = localStorage.getItem('sg_token');
    var resp = await fetch('/api/dashboard/notifications', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) return;
    var notifications = await resp.json();

    var container = document.getElementById('live-notifications');
    if (!container) return;

    function timeAgo(dateStr) {
      if (!dateStr) return '';
      var diff = Date.now() - new Date(dateStr).getTime();
      var mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return mins + ' min ago';
      var hours = Math.floor(mins / 60);
      if (hours < 24) return hours + ' hour' + (hours > 1 ? 's' : '') + ' ago';
      var days = Math.floor(hours / 24);
      return days + ' day' + (days > 1 ? 's' : '') + ' ago';
    }

    if (notifications.length > 0) {
      var html = '';
      notifications.forEach(function(n, i) {
        html += '<div class="dropdown-item notification-item py-2 text-wrap" id="notification-live-' + i + '">' +
          '<span class="d-flex align-items-center">' +
          '<div class="avatar-lg flex-shrink-0 me-3">' +
          '<span class="avatar-title bg-' + n.color + '-subtle text-' + n.color + ' rounded-circle fs-22">' +
          '<i class="' + n.icon + '"></i></span></div>' +
          '<span class="flex-grow-1">' +
          '<span class="fw-semibold text-reset">' + n.title + '</span>' +
          (n.subtitle ? '<br/><span class="fw-medium text-reset">' + n.subtitle + '</span>' : '') +
          '<br/><span class="fs-12 text-reset opacity-75">' + timeAgo(n.time) + '</span>' +
          '</span></span></div>';
      });
      container.innerHTML = html;
    }

    // Update badge count
    var badge = document.querySelector('.noti-icon-badge');
    if (badge && notifications.length > 0) {
      badge.textContent = notifications.length;
    }
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}
