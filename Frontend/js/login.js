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

const faceLabel = document.getElementById('faceLabel');
const faceStatus = document.getElementById('faceStatus');
const faceCheckbox = document.getElementById('faceCheckbox');
const skipFaceBtn = document.getElementById('skipFaceBtn');
const backToCredsBtn = document.getElementById('backToCredsBtn');

let isVerified = false;
let isVerifying = false;
let pendingStaff = null;

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

    // credentials valid — move to face step (UI placeholder only, see below)
    pendingStaff = { empId, ...staff };
    credentialsStep.style.display = 'none';
    faceStep.style.display = 'block';
    faceLabel.textContent = 'Face verification coming soon';
    faceStatus.textContent = 'Not yet enabled';
  }, 1200);
});

// ===================== STEP 2: FACE VERIFICATION (UI placeholder, no detection logic) =====================
// Face recognition is not implemented yet — this screen is shown for the UI flow,
// but the only way past it is the user explicitly clicking Skip below.
// No camera access, no model loading, no auto-pass of any kind.
skipFaceBtn.addEventListener('click', () => {
  logAuditEvent(pendingStaff.empId, pendingStaff.role, 'face_skipped_not_implemented');
  finalizeLogin();
});

backToCredsBtn.addEventListener('click', () => {
  faceStep.style.display = 'none';
  credentialsStep.style.display = 'block';
});

// ===================== FINALIZE: SESSION + ROLE REDIRECT =====================
function finalizeLogin() {
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