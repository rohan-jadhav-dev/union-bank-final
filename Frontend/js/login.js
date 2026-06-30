// ===================== STAFF DIRECTORY (mock — wire to auth.py /login endpoint later) =====================
const STAFF_DIRECTORY = {
  'EMP104782': { name: 'Rohan Jadhav', password: 'branch123', role: 'officer',    branch: 'Mumbai Fort' },
  'EMP109933': { name: 'Aditi Rao',    password: 'super123',  role: 'supervisor', branch: 'Mumbai Fort' },
  'EMP110045': { name: 'Karan Mehta',  password: 'branch123', role: 'officer',    branch: 'Andheri' }
};

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 min idle expiry
const MAX_LOGIN_ATTEMPTS = 3;
let failedAttempts = 0;

// face-api model weights — same source the MediScan recognition module uses
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
const FACE_MATCH_THRESHOLD = 0.5;   // lower = stricter match (same default as MediScan's FaceMatcher)
const REQUIRED_MATCH_STREAK = 5;    // consecutive matching frames before auto sign-in
const DETECT_INTERVAL_MS = 400;

let modelsLoaded = false;
let faceStream = null;
let faceLoopHandle = null;
let enrollMode = false;
let matchStreak = 0;

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

const faceSubtitle = document.getElementById('faceSubtitle');
const faceVideo = document.getElementById('faceVideo');
const faceCanvas = document.getElementById('faceCanvas');
const faceLabel = document.getElementById('faceLabel');
const faceStatus = document.getElementById('faceStatus');
const faceCheckbox = document.getElementById('faceCheckbox');
const faceCheckRow = document.getElementById('faceCheckRow');
const captureEnrollBtn = document.getElementById('captureEnrollBtn');
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

    // credentials valid — move to the face verification / enrollment step
    pendingStaff = { empId, ...staff };
    credentialsStep.style.display = 'none';
    faceStep.style.display = 'block';
    enterFaceStep();
  }, 1200);
});

// ===================== STEP 2: FACE VERIFICATION (real, face-api.js powered) =====================
// Same pipeline as the MediScan patient scanner: SSD Mobilenet detector + 68-point
// landmarks + a 128-d face descriptor, matched with faceapi.FaceMatcher.
//
// Storage model (demo / client-side only — see note at bottom of file):
//   localStorage key  vai_face_<EMPID>  ->  JSON array (128-d descriptor)
// First sign-in with no stored descriptor triggers ENROLLMENT.
// Every sign-in after that triggers live VERIFICATION against the stored descriptor.

function getStoredDescriptor(empId) {
  const raw = localStorage.getItem('vai_face_' + empId);
  return raw ? JSON.parse(raw) : null;
}

function storeDescriptor(empId, descriptorArray) {
  localStorage.setItem('vai_face_' + empId, JSON.stringify(descriptorArray));
}

async function loadFaceModels() {
  if (modelsLoaded) return;
  faceStatus.textContent = 'Loading detector…';
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  faceStatus.textContent = 'Loading landmarks…';
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  faceStatus.textContent = 'Loading recognition…';
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  modelsLoaded = true;
}

async function startFaceCamera() {
  faceStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320 } });
  faceVideo.srcObject = faceStream;
  await new Promise(resolve => { faceVideo.onloadedmetadata = resolve; });
  await faceVideo.play();
  faceCanvas.width = faceVideo.videoWidth || 320;
  faceCanvas.height = faceVideo.videoHeight || 320;
}

function stopFaceCamera() {
  if (faceLoopHandle) { clearInterval(faceLoopHandle); faceLoopHandle = null; }
  if (faceStream) { faceStream.getTracks().forEach(t => t.stop()); faceStream = null; }
  faceVideo.srcObject = null;
  const ctx = faceCanvas.getContext('2d');
  ctx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
}

async function enterFaceStep() {
  faceCheckbox.classList.remove('verified');
  faceCheckRow.classList.remove('verified');
  faceLabel.textContent = 'Initializing camera…';
  faceStatus.textContent = 'Loading models';
  captureEnrollBtn.style.display = 'none';
  matchStreak = 0;

  try {
    await loadFaceModels();
  } catch (err) {
    faceLabel.textContent = 'Could not load face models';
    faceStatus.textContent = 'Check internet connection';
    return;
  }

  try {
    await startFaceCamera();
  } catch (err) {
    faceLabel.textContent = 'Camera permission denied';
    faceStatus.textContent = 'Use password only below';
    return;
  }

  const stored = getStoredDescriptor(pendingStaff.empId);
  enrollMode = !stored;

  if (enrollMode) {
    faceSubtitle.textContent = "First sign-in on this device — let's enroll your face for next time.";
    faceLabel.textContent = 'Position your face in the frame';
    faceStatus.textContent = 'Enrollment';
    captureEnrollBtn.style.display = 'flex';
    captureEnrollBtn.disabled = true;
    startEnrollDetectionLoop();
  } else {
    faceSubtitle.textContent = 'Look at the camera to confirm your identity.';
    faceLabel.textContent = 'Scanning…';
    faceStatus.textContent = 'Verifying';
    startVerificationLoop(stored);
  }
}

// ---- Enrollment: detect a face, let the user confirm capture, store descriptor ----
function startEnrollDetectionLoop() {
  faceLoopHandle = setInterval(async () => {
    const det = await faceapi
      .detectSingleFace(faceVideo, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks();

    const ctx = faceCanvas.getContext('2d');
    ctx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);

    if (det) {
      const box = det.detection.box;
      ctx.strokeStyle = '#4A9D6E';
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      faceLabel.textContent = 'Face detected — tap Capture & Enroll';
      captureEnrollBtn.disabled = false;
    } else {
      faceLabel.textContent = 'No face detected';
      captureEnrollBtn.disabled = true;
    }
  }, DETECT_INTERVAL_MS);
}

captureEnrollBtn.addEventListener('click', async () => {
  captureEnrollBtn.disabled = true;
  captureEnrollBtn.querySelector('.btn-text').textContent = 'Capturing…';

  const det = await faceapi
    .detectSingleFace(faceVideo, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!det) {
    faceLabel.textContent = 'No face found — try again';
    captureEnrollBtn.disabled = false;
    captureEnrollBtn.querySelector('.btn-text').textContent = 'Capture & Enroll Face';
    return;
  }

  storeDescriptor(pendingStaff.empId, Array.from(det.descriptor));
  if (faceLoopHandle) { clearInterval(faceLoopHandle); faceLoopHandle = null; }

  faceCheckbox.classList.add('verified');
  faceCheckRow.classList.add('verified');
  faceLabel.textContent = 'Face enrolled — signing you in…';
  faceStatus.textContent = 'Enrolled';
  captureEnrollBtn.style.display = 'none';

  logAuditEvent(pendingStaff.empId, pendingStaff.role, 'face_enrolled');
  stopFaceCamera();
  setTimeout(finalizeLogin, 700);
});

// ---- Verification: compare live descriptor against the stored one every frame ----
function startVerificationLoop(storedDescriptor) {
  const matcher = new faceapi.FaceMatcher(
    [new faceapi.LabeledFaceDescriptors(pendingStaff.empId, [new Float32Array(storedDescriptor)])],
    FACE_MATCH_THRESHOLD
  );
  matchStreak = 0;

  faceLoopHandle = setInterval(async () => {
    const det = await faceapi
      .detectSingleFace(faceVideo, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    const ctx = faceCanvas.getContext('2d');
    ctx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);

    if (!det) {
      matchStreak = 0;
      faceLabel.textContent = 'No face detected';
      faceStatus.textContent = 'Waiting';
      return;
    }

    const box = det.detection.box;
    const result = matcher.findBestMatch(det.descriptor);
    const isMatch = result.label === pendingStaff.empId;

    ctx.strokeStyle = isMatch ? '#4A9D6E' : '#E31E24';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    if (isMatch) {
      matchStreak++;
      const confidence = Math.max(0, Math.round((1 - result.distance) * 100));
      faceLabel.textContent = `Matching… (${matchStreak}/${REQUIRED_MATCH_STREAK})`;
      faceStatus.textContent = confidence + '% confidence';

      if (matchStreak >= REQUIRED_MATCH_STREAK) {
        if (faceLoopHandle) { clearInterval(faceLoopHandle); faceLoopHandle = null; }
        faceCheckbox.classList.add('verified');
        faceCheckRow.classList.add('verified');
        faceLabel.textContent = 'Identity confirmed';
        faceStatus.textContent = confidence + '% confidence';
        logAuditEvent(pendingStaff.empId, pendingStaff.role, 'face_verified');
        stopFaceCamera();
        setTimeout(finalizeLogin, 500);
      }
    } else {
      matchStreak = 0;
      faceLabel.textContent = 'Face does not match employee record';
      faceStatus.textContent = 'No match';
    }
  }, DETECT_INTERVAL_MS);
}

skipFaceBtn.addEventListener('click', () => {
  stopFaceCamera();
  logAuditEvent(pendingStaff.empId, pendingStaff.role, 'face_skipped_password_only');
  finalizeLogin();
});

backToCredsBtn.addEventListener('click', () => {
  stopFaceCamera();
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

// =====================================================================================
// IMPORTANT — PRODUCTION NOTE
// This face check (like MediScan's) runs entirely in the browser: models load from a
// public CDN, descriptors are 128-d vectors stored in localStorage, and matching happens
// client-side. That's fine for a prototype, but for a real banking deployment it gives
// no real security guarantee — anyone with devtools access can read localStorage, inject
// a fake "match" result, or skip the step entirely by editing the page. For production:
//   - Do enrollment + matching server-side (send the descriptor or a captured frame to
//     auth.py, compare against an encrypted store, return only pass/fail).
//   - Add liveness detection (blink/turn prompts) so a photo can't be used to spoof it.
//   - Treat the face check as a second factor alongside the password, not a replacement.
// =====================================================================================