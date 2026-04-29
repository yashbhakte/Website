/* ═══════════════════════════════════════════════════════════════════
   NeuAI FabricGuard — Application Logic
   app.js — Single-page application controller
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

const API_BASE = 'http://localhost:8000';

/**
 * Parses a date string from the backend, ensuring it's treated as UTC 
 * if no timezone information is present.
 */
function parseUTCDate(dateStr) {
  if (!dateStr) return new Date();
  // If the string doesn't end with Z and doesn't contain a timezone offset (+/-HH:MM),
  // append 'Z' to force the browser to treat it as UTC.
  if (!dateStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'Z');
  }
  return new Date(dateStr);
}

/* ── DEFECT DATABASE ──────────────────────────────────────────────
   Maps defect class names to root-cause analysis data.
   In production this would come from a backend model API.
   ─────────────────────────────────────────────────────────────── */
const DEFECT_DATABASE = {
  'hole': {
    label: 'Defect Found: Hole',
    status: 'defect',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><circle cx="12" cy="14" r="2.5"/></svg>`,
  },
  'stain': {
    label: 'Defect Found: Stain',
    status: 'defect',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`,
  },
  'broken stitch': {
    label: 'Defect Found: Broken Stitch',
    status: 'defect',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 4 8"/><line x1="8" x2="12" y1="12" y2="12"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`,
  },
  'needle mark': {
    label: 'Defect Found: Needle Mark',
    status: 'defect',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="m20 12-8 8-8-8"/></svg>`,
  },
  'pinched fabric': {
    label: 'Defect Found: Pinched Fabric',
    status: 'defect',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M11 21a2 2 0 0 0 2-2v-4a2 2 0 1 0-4 0v4a2 2 0 0 0 2 2z"/></svg>`,
  },
  'vertical': {
    label: 'Defect Found: Vertical Line',
    status: 'defect',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="8" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="16" y2="21"/></svg>`,
  },
  'horizontal': {
    label: 'Defect Found: Horizontal Line',
    status: 'defect',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/></svg>`,
  },
  'lines': {
    label: 'Defect Found: Lines',
    status: 'defect',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18"/><path d="M3 12h18"/><path d="M3 17h18"/></svg>`,
  },
  'defect free': {
    label: 'Status: Defect Free',
    status: 'ok',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  },
};

/* ── DEMO IMAGE POOL ─────────────────────────────────────────── */
const DEMO_IMAGES = [
  'fabric_defect.png',
];

/* ─────────────────────────────────────────────────────────────
   APPLICATION STATE
   ───────────────────────────────────────────────────────────── */
const appState = {
  token: localStorage.getItem('fg_token') || null,
  currentImage: null,       // data URL or blob URL
  currentResult: null,      // defect result object
  cameraStream: null,       // MediaStream
  isCameraActive: false,
  isProcessing: false,
  logs: [],                 // array of log entries
  analytics: { total: 0, defects: 0, ok: 0 },
  user: { name: localStorage.getItem('fg_user_name') || '', email: '' },
};

/* ─────────────────────────────────────────────────────────────
   DOM ELEMENT REFERENCES
   ───────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const DOM = {
  // Header
  networkStatus: $('network-status'),
  statusDot: $('status-dot'),
  statusLabel: $('status-label'),
  logCountBadge: $('log-count-badge'),
  headerRight: $('header-right'),
  brandContainer: $('brand-container'),
  profileContainer: $('profile-container'),
  profileTrigger: $('profile-trigger'),
  profileName: $('profile-name'),
  profileDropdown: $('profile-dropdown'),

  // Auth Views
  loginLayout: $('login-layout'),
  loginView: $('login-view'),
  signupView: $('signup-view'),
  forgotView: $('forgot-view'),
  loginForm: $('login-form'),
  signupForm: $('signup-form'),
  forgotForm: $('forgot-form'),
  loginId: $('login-id'),
  loginPassword: $('login-password'),
  signupName: $('signup-name'),
  signupId: $('signup-id'),
  signupPassword: $('signup-password'),
  btnShowSignup: $('btn-show-signup'),
  btnShowLogin: $('btn-show-login'),
  btnShowForgot: $('btn-show-forgot'),
  btnTogglePasswords: document.querySelectorAll('.btn-toggle-password'),
  forgotStep1: $('forgot-step-1'),
  forgotStep2: $('forgot-step-2'),
  btnResetPassword: $('btn-reset-password'),

  // Capture View
  viewCapture: $('view-capture'),
  cameraFrame: $('camera-frame'),
  cameraIdle: $('camera-idle'),
  cameraFeed: $('camera-feed'),
  imagePreview: $('image-preview'),
  scanLine: $('scan-line'),
  processingOverlay: $('processing-overlay'),
  progressBar: $('progress-bar'),
  btnOpenCamera: $('btn-open-camera'),
  btnUploadImage: $('btn-upload-image'),
  btnCapturePhoto: $('btn-capture-photo'),
  // btnDemoScan: $('btn-demo-scan'),
  fileInput: $('file-input'),
  captureCanvas: $('capture-canvas'),

  // Results View
  viewResults: $('view-results'),
  resultTimestamp: $('result-timestamp'),
  classificationBanner: $('classification-banner'),
  classificationIcon: $('classification-icon'),
  classificationLabel: $('classification-label'),
  classificationValue: $('classification-value'),
  confidenceValue: $('confidence-value'),
  resultImage: $('result-image'),
  qsDefectType: $('qs-defect-type'),
  qsSeverity: $('qs-severity'),
  qsConfidence: $('qs-confidence'),
  reason1: $('reason-1'),
  reason2: $('reason-2'),
  reason3: $('reason-3'),
  machineResponsible: $('machine-responsible'),
  correctiveSuggestion: $('corrective-suggestion'),
  btnLogErp: $('btn-log-erp'),
  btnGeneratePdf: $('btn-generate-pdf'),
  btnClear: $('btn-clear'),
  toastContainer: $('toast-container'),

  // Logs Panel
  shiftLogsPanel: $('shift-logs-panel'),
  logsClose: $('logs-close'),
  sidebarBackdrop: $('sidebar-backdrop'),
  logsTableBody: $('logs-table-body'),
  logsEmptyRow: $('logs-empty-row'),
  analyticsTotal: $('analytics-total'),
  analyticsDefects: $('analytics-defects'),
  analyticsOk: $('analytics-ok'),
  analyticsRate: $('analytics-rate'),
  btnExportCsv: $('btn-export-csv'),
  btnClearLogs: $('btn-clear-logs'),

  // ERP Modal
  erpModal: $('erp-modal'),
  erpModalClose: $('erp-modal-close'),
  erpCancel: $('erp-cancel'),
  erpSubmit: $('erp-submit'),
  erpNotes: $('erp-notes'),
};

/* ═══════════════════════════════════════════════════════════════
   1. NETWORK STATUS MONITOR
   ═══════════════════════════════════════════════════════════════ */
function updateNetworkStatus() {
  const online = navigator.onLine;
  DOM.statusDot.className = `status-dot status-dot--${online ? 'online' : 'offline'}`;
  DOM.statusLabel.textContent = online ? 'Online' : 'Offline';
  DOM.networkStatus.setAttribute('aria-label', `Network status: ${online ? 'Online' : 'Offline'}`);
  if (!online) showToast('warning', 'Offline Mode', 'Network unavailable. Results cached locally.', 5000);
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();

/* ═══════════════════════════════════════════════════════════════
   2. PROFILE & BRAND DROPDOWNS
   ═══════════════════════════════════════════════════════════════ */
function toggleProfileDropdown() {
  const isExpanded = DOM.profileTrigger.getAttribute('aria-expanded') === 'true';
  DOM.profileTrigger.setAttribute('aria-expanded', !isExpanded);
  DOM.profileDropdown.classList.toggle('hidden');
}

function closeProfileDropdown() {
  DOM.profileTrigger.setAttribute('aria-expanded', 'false');
  DOM.profileDropdown.classList.add('hidden');
}

DOM.profileTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleProfileDropdown();
});

document.addEventListener('click', (e) => {
  if (!DOM.profileContainer.contains(e.target)) closeProfileDropdown();
});

function signOut() {
  closeProfileDropdown();
  appState.token = null;
  appState.user.name = '';
  appState.user.email = '';
  localStorage.removeItem('fg_token');
  localStorage.removeItem('fg_user_name');

  // Transition back to login
  $('app-layout').classList.add('hidden');
  DOM.headerRight.classList.add('hidden');
  DOM.loginLayout.classList.remove('hidden');
  setTimeout(() => DOM.loginLayout.classList.add('active'), 10);

  showLoginView();
  showToast('info', 'Signed Out', 'You have been securely logged out.');
}

document.querySelectorAll('.btn-sign-out-trigger').forEach(btn => {
  btn.addEventListener('click', signOut);
});

/* ═══════════════════════════════════════════════════════════════
   2.1 AUTH CONTROLLER (REAL BACKEND INTEGRATION)
   ═══════════════════════════════════════════════════════════════ */
async function handleLogin(e) {
  e.preventDefault();

  const email = DOM.loginId.value.trim();
  const password = DOM.loginPassword.value;

  const btn = DOM.loginForm.querySelector('button[type="submit"]');
  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span style="display:flex;align-items:center;gap:8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin-ring 0.8s linear infinite;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Authenticating...</span>`;

  try {
    const formData = new URLSearchParams();
    formData.append('username', email); // FastAPI OAuth2 uses 'username' field
    formData.append('password', password);

    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Login failed');
    }

    const data = await response.json();
    
    // Save state
    appState.token = data.access_token;
    appState.user.name = data.user_name;
    localStorage.setItem('fg_token', data.access_token);
    localStorage.setItem('fg_user_name', data.user_name);

    // Update Profile Info
    DOM.profileName.textContent = data.user_name;

    // Fetch initial data
    await Promise.all([fetchHistory(), fetchAnalytics()]);

    // Transition Views
    DOM.loginLayout.classList.remove('active');
    DOM.loginLayout.classList.add('hidden');
    
    $('app-layout').classList.remove('hidden');
    $('app-layout').classList.add('active');
    
    DOM.headerRight.classList.remove('hidden');

    // Set default sub-view
    DOM.viewCapture.classList.remove('hidden');
    DOM.viewCapture.classList.add('active');

    showToast('success', 'Access Granted', `Welcome back, ${data.user_name}. Authorized session started.`);
  } catch (err) {
    showToast('error', 'Login Failed', err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

async function handleSignup(e) {
  e.preventDefault();

  const name = DOM.signupName.value.trim();
  const email = DOM.signupId.value.trim();
  const password = DOM.signupPassword.value;

  const btn = DOM.signupForm.querySelector('button[type="submit"]');
  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span style="display:flex;align-items:center;gap:8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin-ring 0.8s linear infinite;"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Creating Account...</span>`;

  try {
    const response = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name, email, password })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Signup failed');
    }

    showToast('success', 'Account Created', `Registration successful for ${name}. You can now sign in.`);
    showLoginView();
  } catch (err) {
    showToast('error', 'Signup Failed', err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

function showSignupView() {
  hideAllAuthViews();
  DOM.signupView.classList.remove('hidden');
  setTimeout(() => DOM.signupView.classList.add('active'), 10);
}

function showLoginView() {
  hideAllAuthViews();
  DOM.loginView.classList.remove('hidden');
  setTimeout(() => DOM.loginView.classList.add('active'), 10);
}

function showForgotView() {
  hideAllAuthViews();
  DOM.forgotView.classList.remove('hidden');
  setTimeout(() => DOM.forgotView.classList.add('active'), 10);
}

function hideAllAuthViews() {
  [DOM.loginView, DOM.signupView, DOM.forgotView].forEach(view => {
    view.classList.remove('active');
    view.classList.add('hidden');
  });
}

function togglePasswordVisibility(e) {
  const btn = e.currentTarget;
  const input = btn.parentElement.querySelector('input');
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';

  btn.innerHTML = isPassword
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
}

DOM.loginForm.addEventListener('submit', handleLogin);
DOM.signupForm.addEventListener('submit', handleSignup);
DOM.btnShowSignup.addEventListener('click', showSignupView);
DOM.btnShowLogin.addEventListener('click', showLoginView);
DOM.btnShowForgot.addEventListener('click', showForgotView);
document.querySelectorAll('.btn-show-login-alt').forEach(btn => btn.addEventListener('click', showLoginView));
DOM.btnTogglePasswords.forEach(btn => btn.addEventListener('click', togglePasswordVisibility));

/* ═══════════════════════════════════════════════════════════════
   3. DATA FETCHING (HISTORY & ANALYTICS)
   ═══════════════════════════════════════════════════════════════ */
async function fetchHistory() {
  if (!appState.token) return;
  try {
    const response = await fetch(`${API_BASE}/history`, {
      headers: { 'Authorization': `Bearer ${appState.token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch history');
    const data = await response.json();
    
    appState.logs = data.map(scan => ({
      id: scan.id,
      time: parseUTCDate(scan.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      defectType: scan.defect_key === 'defect free' ? 'Defect Free' : scan.defect_label,
      machine: scan.machine,
      status: scan.status,
      confidence: scan.confidence
    }));
    
    renderLogsTable();
    if (DOM.logCountBadge) DOM.logCountBadge.textContent = appState.logs.length;
  } catch (err) {
    console.error('History fetch error:', err);
  }
}

async function fetchAnalytics() {
  if (!appState.token) return;
  try {
    const response = await fetch(`${API_BASE}/analytics`, {
      headers: { 'Authorization': `Bearer ${appState.token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch analytics');
    const data = await response.json();
    
    appState.analytics = data;
    updateAnalytics();
  } catch (err) {
    console.error('Analytics fetch error:', err);
  }
}

function updateAnalytics() {
  const { total, defects, ok, rate } = appState.analytics;
  DOM.analyticsTotal.textContent = total;
  DOM.analyticsDefects.textContent = defects;
  DOM.analyticsOk.textContent = ok;
  DOM.analyticsRate.textContent = rate;
}

function renderLogsTable() {
  const tbody = DOM.logsTableBody;
  Array.from(tbody.querySelectorAll('.log-data-row')).forEach(r => r.remove());

  if (appState.logs.length === 0) {
    if (!tbody.contains(DOM.logsEmptyRow)) tbody.appendChild(DOM.logsEmptyRow);
    return;
  }

  if (DOM.logsEmptyRow) DOM.logsEmptyRow.remove();

  appState.logs.slice(0, 50).forEach((entry) => {
    const tr = document.createElement('tr');
    tr.className = 'log-data-row';
    tr.innerHTML = `
      <td>${entry.time}</td>
      <td>${entry.defectType}</td>
      <td style="font-family: var(--ff-mono); font-size: var(--fs-xs); color: var(--clr-text-secondary);">${entry.machine}</td>
      <td style="font-family: var(--ff-mono); font-size: var(--fs-xs); color: var(--clr-accent);">${entry.confidence}%</td>
      <td>
        <span class="log-status-badge log-status-badge--${entry.status === 'defect' ? 'defect' : 'ok'}">
          ${entry.status === 'defect' ? 'Defect' : 'Clear'}
        </span>
      </td>`;
    tbody.appendChild(tr);
  });
}

/* ═══════════════════════════════════════════════════════════════
   4. CAMERA & IMAGE CAPTURE
   ═══════════════════════════════════════════════════════════════ */
DOM.btnOpenCamera.addEventListener('click', async () => {
  if (appState.isCameraActive) { stopCamera(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    appState.cameraStream = stream;
    appState.isCameraActive = true;
    DOM.cameraFeed.srcObject = stream;
    DOM.cameraFeed.classList.remove('hidden');
    DOM.cameraIdle.classList.add('hidden');
    DOM.imagePreview.classList.add('hidden');
    DOM.scanLine.classList.remove('hidden');
    DOM.btnOpenCamera.innerHTML = `<span class="btn__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span><span class="btn__label">Stop Camera</span>`;
    DOM.btnCapturePhoto.classList.remove('hidden');
    DOM.btnUploadImage.classList.add('hidden');
  } catch (err) {
    showToast('error', 'Camera Error', 'Could not access camera device.');
  }
});

function stopCamera() {
  if (appState.cameraStream) appState.cameraStream.getTracks().forEach(t => t.stop());
  appState.isCameraActive = false;
  DOM.cameraFeed.classList.add('hidden');
  DOM.scanLine.classList.add('hidden');
  DOM.btnCapturePhoto.classList.add('hidden');
  DOM.btnUploadImage.classList.remove('hidden');
  DOM.cameraIdle.classList.remove('hidden');
  DOM.btnOpenCamera.innerHTML = `<span class="btn__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span><span class="btn__label">Open Device Camera</span>`;
}

DOM.btnCapturePhoto.addEventListener('click', () => {
  const canvas = DOM.captureCanvas;
  canvas.width = DOM.cameraFeed.videoWidth;
  canvas.height = DOM.cameraFeed.videoHeight;
  canvas.getContext('2d').drawImage(DOM.cameraFeed, 0, 0);
  processImage(canvas.toDataURL('image/jpeg'), 'camera');
  stopCamera();
});

DOM.btnUploadImage.addEventListener('click', () => DOM.fileInput.click());
DOM.fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => processImage(ev.target.result, 'upload');
  reader.readAsDataURL(file);
});

/* ═══════════════════════════════════════════════════════════════
   5. REAL AI PROCESSING (LINKED TO USER)
   ═══════════════════════════════════════════════════════════════ */
async function processImage(imageDataURL, source) {
  if (appState.isProcessing || !appState.token) {
    if (!appState.token) showToast('warning', 'Session Expired', 'Please login to perform scans.');
    return;
  }
  appState.isProcessing = true;
  appState.currentImage = imageDataURL;

  DOM.imagePreview.src = imageDataURL;
  DOM.imagePreview.classList.remove('hidden');
  DOM.cameraIdle.classList.add('hidden');
  DOM.processingOverlay.classList.remove('hidden');

  try {
    let blob;
    if (imageDataURL.startsWith('data:')) {
      // It's already a data URL (from camera or upload)
      blob = await (await fetch(imageDataURL)).blob();
    } else {
      // It's a regular URL (like the demo image), use canvas to avoid CORS/fetch issues
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageDataURL;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      blob = await (await fetch(dataUrl)).blob();
    }

    const formData = new FormData();
    formData.append('file', blob, 'capture.jpg');

    const response = await fetch(`${API_BASE}/predict`, {
      method: 'POST',
      body: formData,
      headers: { 'Authorization': `Bearer ${appState.token}` }
    });

    if (response.status === 401) {
      showToast('error', 'Session Expired', 'Your session has ended. Please log in again.');
      setTimeout(signOut, 2000);
      return;
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Prediction failed');
    }

    const apiResult = await response.json();
    console.log('Prediction success:', apiResult);
    
    const uiConfig = DEFECT_DATABASE[apiResult.defect_key] || DEFECT_DATABASE['hole'];
    
    const result = {
      ...apiResult,
      label: apiResult.status === 'ok' ? 'Status: Defect Free' : `Defect Found: ${apiResult.defect_label}`,
      icon: uiConfig.icon
    };

    appState.currentResult = result;
    showResults(result, apiResult.image_url || imageDataURL, apiResult.confidence);
    
    // Refresh history and analytics
    await Promise.all([fetchHistory(), fetchAnalytics()]);

  } catch (err) {
    console.error('Processing error:', err);
    showToast('error', 'Processing Failed', err.message || 'Model backend error.');
  } finally {
    DOM.processingOverlay.classList.add('hidden');
    appState.isProcessing = false;
  }
}

function showResults(result, imageURL, confidence) {
  // Hide capture, show results
  DOM.viewCapture.classList.add('hidden');
  DOM.viewCapture.classList.remove('active');
  
  DOM.viewResults.classList.remove('hidden');
  DOM.viewResults.classList.add('active');
  
  window.scrollTo({ top: 0, behavior: 'smooth' });

  DOM.resultTimestamp.textContent = `Analysis completed at ${new Date().toLocaleTimeString()} — ${new Date().toLocaleDateString()}`;
  DOM.classificationBanner.className = `classification-banner state--${result.status}`;
  DOM.classificationIcon.innerHTML = result.icon;
  DOM.classificationLabel.textContent = result.status === 'ok' ? 'Quality Status' : 'Defect Alert';
  DOM.classificationValue.textContent = result.label;
  DOM.confidenceValue.textContent = `${confidence}%`;
  DOM.resultImage.src = imageURL;
  DOM.qsDefectType.textContent = result.defect_label;
  DOM.qsSeverity.textContent = result.severity;
  DOM.qsConfidence.textContent = `${confidence}%`;
  DOM.reason1.textContent = result.reason_1;
  DOM.reason2.textContent = result.reason_2;
  DOM.reason3.textContent = result.reason_3;
  DOM.machineResponsible.textContent = result.machine;
  DOM.correctiveSuggestion.textContent = result.suggestion;

  showToast(result.status === 'defect' ? 'error' : 'success', 
            result.status === 'defect' ? 'Defect Detected' : 'Inspection Passed', 
            `${result.label} — Confidence: ${confidence}%`);
}

DOM.btnClear.addEventListener('click', () => {
  // Hide results, show capture
  DOM.viewResults.classList.add('hidden');
  DOM.viewResults.classList.remove('active');
  
  DOM.viewCapture.classList.remove('hidden');
  DOM.viewCapture.classList.add('active');
  
  DOM.imagePreview.src = '';
  DOM.imagePreview.classList.add('hidden');
  DOM.cameraIdle.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ═══════════════════════════════════════════════════════════════
   6. MISC UI & TOASTS
   ═══════════════════════════════════════════════════════════════ */
function showToast(type, title, message) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type === 'warning' ? 'info' : type}`;
  toast.innerHTML = `<div class="toast__body"><div class="toast__title">${title}</div><div class="toast__msg">${message}</div></div>`;
  DOM.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/* 
DOM.btnDemoScan.addEventListener('click', () => {
  const imgUrl = DEMO_IMAGES[0];
  processImage(imgUrl, 'demo');
});
*/

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
async function init() {
  if (appState.token) {
    // Verify token validity first
    try {
      const response = await fetch(`${API_BASE}/users/me`, {
        headers: { 'Authorization': `Bearer ${appState.token}` }
      });
      
      if (!response.ok) {
        throw new Error('Session invalid');
      }
      
      const userData = await response.json();
      appState.user.name = userData.full_name;
      appState.user.email = userData.email;
      DOM.profileName.textContent = userData.full_name;
      
      // Successfully verified, show app
      DOM.loginLayout.classList.add('hidden');
      DOM.loginLayout.classList.remove('active');
      
      $('app-layout').classList.remove('hidden');
      $('app-layout').classList.add('active');
      
      DOM.headerRight.classList.remove('hidden');
      
      // Ensure capture view is active by default in the app layout
      DOM.viewCapture.classList.remove('hidden');
      DOM.viewCapture.classList.add('active');
      
      await Promise.all([fetchHistory(), fetchAnalytics()]);
    } catch (err) {
      console.warn('Initial session check failed:', err);
      // Clear invalid session
      appState.token = null;
      localStorage.removeItem('fg_token');
      localStorage.removeItem('fg_user_name');
      showLoginView();
    }
  } else {
    showLoginView();
  }
}

document.addEventListener('DOMContentLoaded', init);
