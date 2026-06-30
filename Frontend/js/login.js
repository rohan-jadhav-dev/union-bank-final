// ===================== STAFF DIRECTORY (mock — wire to auth.py /login endpoint later) =====================
const STAFF_DIRECTORY = {
  'EMP104782': { name: 'Rohan Jadhav', password: 'branch123', role: 'officer',    branch: 'Mumbai Fort' },
  'EMP109933': { name: 'Aditi Rao',    password: 'super123',  role: 'supervisor', branch: 'Mumbai Fort' },
  'EMP110045': { name: 'Karan Mehta',  password: 'branch123', role: 'officer',    branch: 'Andheri' }
};

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 min idle expiry
const MAX_LOGIN_ATTEMPTS = 3;
let failedAttempts = 0;

// ===================== ELEMENT REFERENCES =====================
const credentialsStep = document.getElementById('credentialsStep');
const faceStep = document.getElementById('faceStep');

const loginForm = document.getElementById('loginForm');
const empIdInput = document.getElementById('empId');
const passwordInput = document.getElementById('password');
const empIdError = document.getElementById('empIdError');
const passwordError = document.getElementById('passwordError');
const authError = document.getElementById('authError');
const togglePasswordBtn = document.getElementById('togglePassword');
const securityCheckbox = document.getElementById('securityCheckbox');
const securityCheck = document.getElementById('securityCheck');
const securitySpinner = document.getElementById('securitySpinner');
const securityLabel = document.getElementById('securityLabel');
const submitBtn = document.getElementById('submitBtn');
const btnSpinner = document.getElementById('btnSpinner');
const btnText = submitBtn.querySelector('.btn-text');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');

const faceVideo = document.getElementById('faceVideo');
const faceLabel = document.getElementById('faceLabel');
const faceStatus = document.getElementById('faceStatus');
const faceCheckbox = document.getElementById('faceCheckbox');
const faceSpinner = document.getElementById('faceSpinner');
const retryFaceBtn = document.getElementById('retryFaceBtn');
const backToCredsBtn = document.getElementById('backToCredsBtn');

let isVerified = false;
let isVerifying = false;
let faceVerified = false;
let pendingStaff = null;
let faceStream = null;
let faceInterval = null;

// ===================== PASSWORD TOGGLE =====================
togglePasswordBtn.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
});

// ===================== FIELD VALIDATION =====================
function clearFieldError(input, errorEl) {
  input.classList.remove('error');
  errorEl.classList.remove('show');
}

function setFieldError(input, errorEl, message) {
  input.classList.add('error');
  if (message) errorEl.textContent = message;
  errorEl.classList.add('show');
}

empIdInput.addEventListener('input', () => {
  clearFieldError(empIdInput, empIdError);
  authError.classList.remove('show');
});
passwordInput.addEventListener('input', () => {
  clearFieldError(passwordInput, passwordError);
  authError.classList.remove('show');
});

// ===================== SECURITY CHECK (consent box) =====================
function runSecurityCheck() {
  if (isVerified || isVerifying) return;
  isVerifying = true;
  securityCheckbox.classList.add('checking');
  setTimeout(() => {
    securityCheckbox.classList.remove('checking');
    securityCheckbox.classList.add('verified');
    securityCheckbox.setAttribute('aria-checked', 'true');
    securityCheck.classList.add('verified');
    securityLabel.textContent = 'Identity confirmed';
    isVerified = true;
    isVerifying = false;
  }, 900);
}

securityCheckbox.addEventListener('click', runSecurityCheck);
securityCheckbox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); runSecurityCheck(); }
});

// ===================== TOAST =====================
function showToast(message, isError = false) {
  toastText.textContent = message;
  toast.style.background = isError ? 'var(--error)' : 'var(--navy)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

// ===================== AUDIT LOG (local, swap for POST /log-login later) =====================
function logAuditEvent(empId, role, status) {
  const logs = JSON.parse(localStorage.getItem('vai_audit_log') || '[]');
  logs.push({ empId, role, status, timestamp: new Date().toISOString() });
  localStorage.setItem('vai_audit_log', JSON.stringify(logs));
  // Backend hook (uncomment once auth.py endpoint exists):
  // fetch('/api/log-login', { method: 'POST', headers: {'Content-Type':'application/json'},
  //   body: JSON.stringify({ empId, role, status }) });
}

// ===================== STEP 1 → STEP 2 TRANSITION =====================
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  let hasError = false;

  if (!empIdInput.value.trim()) {
    setFieldError(empIdInput, empIdError, 'Enter your employee ID');
    hasError = true;
  } else {
    clearFieldError(empIdInput, empIdError);
  }

  if (!passwordInput.value.trim()) {
    setFieldError(passwordInput, passwordError, 'Enter your password');
    hasError = true;
  } else {
    clearFieldError(passwordInput, passwordError);
  }

  if (!isVerified) {
    securityCheck.classList.add('shake');
    setTimeout(() => securityCheck.classList.remove('shake'), 400);
    hasError = true;
  }

  if (hasError) {
    if (empIdInput.classList.contains('error') || passwordInput.classList.contains('error')) {
      loginForm.classList.add('shake');
      setTimeout(() => loginForm.classList.remove('shake'), 400);
    }
    if (!isVerified) showToast('Please complete the security check', true);
    return;
  }

  submitBtn.disabled = true;
  btnText.textContent = 'Verifying credentials';
  btnSpinner.classList.add('show');

  setTimeout(() => {
    btnSpinner.classList.remove('show');
    btnText.textContent = 'Continue';
    submitBtn.disabled = false;

    const empId = empIdInput.value.trim().toUpperCase();
    const staff = STAFF_DIRECTORY[empId];

    if (!staff || staff.password !== passwordInput.value.trim()) {
      failedAttempts++;
      logAuditEvent(empId, 'unknown', 'failed');

      if (failedAttempts >= MAX_LOGIN_ATTEMPTS) {
        setFieldError(passwordInput, authError, 'Too many failed attempts. Account locked — contact branch IT.');
        submitBtn.disabled = true;
        return;
      }

      setFieldError(passwordInput, authError, `Employee ID or password is incorrect (${MAX_LOGIN_ATTEMPTS - failedAttempts} attempt(s) left)`);
      loginForm.classList.add('shake');
      setTimeout(() => loginForm.classList.remove('shake'), 400);
      return;
    }

    // credentials valid — move to face step
    pendingStaff = { empId, ...staff };
    credentialsStep.style.display = 'none';
    faceStep.style.display = 'block';
    startFaceCheck();
  }, 1200);
});

// ===================== STEP 2: FACE VERIFICATION =====================
async function startFaceCheck() {
  faceVerified = false;
  faceCheckbox.classList.remove('verified');
  faceCheckbox.classList.add('checking');
  faceLabel.textContent = 'Position your face in frame';
  faceStatus.textContent = 'Scanning…';
  retryFaceBtn.style.display = 'none';
  backToCredsBtn.style.display = 'block';

  // Step A: load detection model — separated so model failures aren't mislabeled as camera failures
  try {
    if (!faceapi.nets.tinyFaceDetector.isLoaded) {
      await faceapi.nets.tinyFaceDetector.loadFromUri(
        'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights'
      );
    }
  } catch (modelErr) {
    console.error('Face model failed to load:', modelErr);
    blockLogin('model_load_failed', 'Verification model failed to load — check network/ad-blocker', 'Model error');
    return;
  }

  // Step B: request camera — separate try so we can tell model errors from camera errors
  try {
    faceStream = await navigator.mediaDevices.getUserMedia({ video: {} });
    faceVideo.srcObject = faceStream;

    faceInterval = setInterval(async () => {
      if (faceVerified) return;
      try {
        const result = await faceapi.detectSingleFace(
          faceVideo,
          new faceapi.TinyFaceDetectorOptions()
        );
        if (result) {
          clearInterval(faceInterval);
          stopFaceStream();
          faceVerified = true;
          faceCheckbox.classList.remove('checking');
          faceCheckbox.classList.add('verified');
          faceLabel.textContent = 'Face verified';
          faceStatus.textContent = '✓ Confirmed';
          logAuditEvent(pendingStaff.empId, pendingStaff.role, 'face_verified');
          finalizeLogin();
        }
      } catch (err) {
        // detection hiccup, keep trying until timeout below
      }
    }, 700);

    // timeout fallback — verification did not succeed, so login is blocked, not granted
    setTimeout(() => {
      if (!faceVerified) {
        clearInterval(faceInterval);
        stopFaceStream();
        blockLogin('timeout', 'Could not verify face within the time limit', 'Timed out');
      }
    }, 8000);

  } catch (err) {
    // log the real error name so this is debuggable, instead of a generic message
    console.error('Camera access failed:', err.name, err.message);
    blockLogin(
      `camera_${err.name || 'unknown'}`,
      `Camera unavailable (${err.name || 'unknown'}) — face verification could not run`,
      'Camera error'
    );
  }
}

// Any failure path (model load, camera access, or detection timeout) lands here.
// None of these grant access — face verification must actually succeed to log in.
function blockLogin(reasonCode, label, statusText) {
  faceVerified = false;
  faceCheckbox.classList.remove('checking', 'verified');
  faceLabel.textContent = label;
  faceStatus.textContent = statusText;
  retryFaceBtn.style.display = 'block';
  submitBtn.disabled = false;

  logAuditEvent(pendingStaff.empId, pendingStaff.role, `face_failed_${reasonCode}`);
  showToast('Identity could not be verified. Please retry or contact branch IT.', true);
}

function stopFaceStream() {
  if (faceStream) {
    faceStream.getTracks().forEach(t => t.stop());
    faceStream = null;
  }
}

retryFaceBtn.addEventListener('click', startFaceCheck);

backToCredsBtn.addEventListener('click', () => {
  clearInterval(faceInterval);
  stopFaceStream();
  faceStep.style.display = 'none';
  credentialsStep.style.display = 'block';
});

// ===================== FINALIZE: SESSION + ROLE REDIRECT =====================
// Only ever called after faceVerified === true via a real successful detection.
function finalizeLogin() {
  if (!faceVerified) return; // defensive guard, should be unreachable

  const now = Date.now();
  const session = {
    empId: pendingStaff.empId,
    name: pendingStaff.name,
    role: pendingStaff.role,
    branch: pendingStaff.branch,
    loginTime: now,
    expiresAt: now + SESSION_DURATION_MS
  };
  localStorage.setItem('vai_session', JSON.stringify(session));
  logAuditEvent(pendingStaff.empId, pendingStaff.role, 'success');

  showToast(`Welcome, ${pendingStaff.name}`);
  setTimeout(() => {
    window.location.href = pendingStaff.role === 'supervisor'
      ? 'dashboard.html?view=supervisor'
      : 'dashboard.html';
  }, 700);
}