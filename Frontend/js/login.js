// ===================== VoiceAssist AI — Staff Portal Login Logic =====================
// Wires login.html to the FastAPI backend on Hugging Face Space.

const API_BASE = "https://rohan667-voiceassist-ai-backend-kj.hf.space/api";
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model";
const MATCH_THRESHOLD = 0.6; // lower = stricter match

// ---------- DOM refs ----------
const credentialsStep = document.getElementById("credentialsStep");
const faceStep = document.getElementById("faceStep");
const loginForm = document.getElementById("loginForm");
const empIdInput = document.getElementById("empId");
const passwordInput = document.getElementById("password");
const empIdError = document.getElementById("empIdError");
const passwordError = document.getElementById("passwordError");
const authError = document.getElementById("authError");
const securityCheckbox = document.getElementById("securityCheckbox");
const securityLabel = document.getElementById("securityLabel");
const securitySpinner = document.getElementById("securitySpinner");
const submitBtn = document.getElementById("submitBtn");
const btnSpinner = document.getElementById("btnSpinner");

const faceVideo = document.getElementById("faceVideo");
const faceCanvas = document.getElementById("faceCanvas");
const faceLabel = document.getElementById("faceLabel");
const faceStatus = document.getElementById("faceStatus");
const faceSubtitle = document.getElementById("faceSubtitle");
const faceCheckbox = document.getElementById("faceCheckbox");
const faceSpinner = document.getElementById("faceSpinner");
const captureEnrollBtn = document.getElementById("captureEnrollBtn");
const skipFaceBtn = document.getElementById("skipFaceBtn");
const backToCredsBtn = document.getElementById("backToCredsBtn");

const toast = document.getElementById("toast");
const toastText = document.getElementById("toastText");

// ---------- session state ----------
let currentStaff = null;   // { staff_id, name, role, branch_id, branch_name, next_step }
let faceMode = null;       // "enroll" | "verify"
let modelsLoaded = false;
let detectInterval = null;
let isAuthorized = false;

// ===================== TOAST =====================
function showToast(message, isError = false) {
  toastText.textContent = message;
  toast.style.background = isError ? "#E31E24" : "";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

// ===================== SECURITY CHECKBOX ("I am an authorized staff member") =====================
function toggleSecurityCheck() {
  isAuthorized = !isAuthorized;
  securityCheckbox.setAttribute("aria-checked", String(isAuthorized));
  securityCheckbox.classList.toggle("checked", isAuthorized);
  securityLabel.textContent = isAuthorized
    ? "Authorized staff member confirmed"
    : "I am an authorized staff member";
}
securityCheckbox.addEventListener("click", toggleSecurityCheck);
securityCheckbox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleSecurityCheck();
  }
});

// ===================== PASSWORD VISIBILITY TOGGLE =====================
document.getElementById("togglePassword").addEventListener("click", () => {
  passwordInput.type = passwordInput.type === "password" ? "text" : "password";
});

// ===================== STEP 1: LOGIN FORM SUBMIT =====================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  empIdError.style.display = "none";
  passwordError.style.display = "none";
  authError.style.display = "none";

  const staffId = empIdInput.value.trim();
  const password = passwordInput.value;

  let hasError = false;
  if (!staffId) {
    empIdError.style.display = "block";
    hasError = true;
  }
  if (!password) {
    passwordError.style.display = "block";
    hasError = true;
  }
  if (!isAuthorized) {
    showToast("Please confirm you are an authorized staff member", true);
    hasError = true;
  }
  if (hasError) return;

  setBtnLoading(true);

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: staffId, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      authError.textContent = data.detail || "Employee ID or password is incorrect";
      authError.style.display = "block";
      setBtnLoading(false);
      return;
    }

    currentStaff = data; // { staff_id, name, role, branch_id, branch_name, face_enrolled, next_step }
    setBtnLoading(false);
    goToFaceStep();
  } catch (err) {
    console.error("Login error:", err);
    showToast("Could not reach the server. Check your connection.", true);
    setBtnLoading(false);
  }
});

function setBtnLoading(loading) {
  submitBtn.disabled = loading;
  btnSpinner.style.display = loading ? "inline-block" : "none";
}

// ===================== STEP TRANSITIONS =====================
function goToFaceStep() {
  credentialsStep.style.display = "none";
  faceStep.style.display = "block";

  faceMode = currentStaff.next_step === "face_enroll" ? "enroll" : "verify";
  faceSubtitle.textContent =
    faceMode === "enroll"
      ? "First time here — let's enroll your face for faster sign-in next time."
      : "Look at the camera to confirm your identity.";
  captureEnrollBtn.style.display = faceMode === "enroll" ? "block" : "none";

  startCamera();
}

backToCredsBtn.addEventListener("click", () => {
  stopCamera();
  faceStep.style.display = "none";
  credentialsStep.style.display = "block";
  currentStaff = null;
});

skipFaceBtn.addEventListener("click", async () => {
  stopCamera();
  const staffId = empIdInput.value.trim();
  const password = passwordInput.value;

  try {
    const res = await fetch(`${API_BASE}/login-password-only`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: staffId, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.detail || "Login failed", true);
      return;
    }
    onLoginSuccess(data);
  } catch (err) {
    console.error(err);
    showToast("Could not reach the server.", true);
  }
});

// ===================== FACE MODELS + CAMERA =====================
async function loadModels() {
  if (modelsLoaded) return;
  faceStatus.textContent = "Loading models";
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
  faceStatus.textContent = "Models ready";
}

async function startCamera() {
  try {
    await loadModels();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: "user" },
    });
    faceVideo.srcObject = stream;

    faceVideo.addEventListener("loadedmetadata", () => {
      faceCanvas.width = faceVideo.videoWidth;
      faceCanvas.height = faceVideo.videoHeight;
    });

    faceLabel.textContent =
      faceMode === "enroll" ? "Position your face in the frame" : "Verifying your face…";
    faceCheckbox.classList.add("active");

    if (faceMode === "enroll") {
      captureEnrollBtn.disabled = false;
      captureEnrollBtn.addEventListener("click", handleEnrollCapture, { once: true });
    } else {
      runAutoVerify();
    }
  } catch (err) {
    console.error("Camera error:", err);
    faceStatus.textContent = "Camera unavailable";
    faceLabel.textContent = "Could not access camera — use password only.";
  }
}

function stopCamera() {
  clearInterval(detectInterval);
  const stream = faceVideo.srcObject;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
  faceVideo.srcObject = null;
}

// ===================== ENROLL FLOW =====================
async function handleEnrollCapture() {
  faceStatus.textContent = "Capturing…";
  const detection = await faceapi
    .detectSingleFace(faceVideo, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    showToast("No face detected — try again", true);
    captureEnrollBtn.addEventListener("click", handleEnrollCapture, { once: true });
    return;
  }

  const descriptor = Array.from(detection.descriptor);

  try {
    const res = await fetch(`${API_BASE}/enroll-face`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: currentStaff.staff_id, descriptor }),
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.detail || "Enrollment failed", true);
      return;
    }

    stopCamera();
    onLoginSuccess({ ...currentStaff, session_id: data.session_id });
  } catch (err) {
    console.error(err);
    showToast("Could not reach the server.", true);
  }
}

// ===================== VERIFY FLOW (auto, runs every ~800ms) =====================
async function runAutoVerify() {
  let referenceDescriptor = null;
  try {
    const res = await fetch(`${API_BASE}/staff-descriptor/${currentStaff.staff_id}`);
    const data = await res.json();
    if (!res.ok || !data.descriptor || data.descriptor.length !== 128) {
      showToast("Could not load face reference — use password only.", true);
      return;
    }
    referenceDescriptor = new Float32Array(data.descriptor);
  } catch (err) {
    console.error(err);
    showToast("Could not reach the server.", true);
    return;
  }

  detectInterval = setInterval(async () => {
    const detection = await faceapi
      .detectSingleFace(faceVideo, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return;

    const distance = faceapi.euclideanDistance(detection.descriptor, referenceDescriptor);
    const isMatch = distance < MATCH_THRESHOLD;
    const confidence = Math.max(0, 1 - distance);

    clearInterval(detectInterval);
    stopCamera();

    faceStatus.textContent = isMatch ? "Match found" : "No match";
    faceLabel.textContent = isMatch ? "Identity confirmed" : "Face did not match";

    try {
      const res = await fetch(`${API_BASE}/verify-face`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_id: currentStaff.staff_id,
          match_result: isMatch,
          confidence: Number(confidence.toFixed(3)),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.detail || "Face verification failed", true);
        return;
      }

      onLoginSuccess({ ...currentStaff, session_id: data.session_id });
    } catch (err) {
      console.error(err);
      showToast("Could not reach the server.", true);
    }
  }, 800);
}

// ===================== SUCCESS =====================
function onLoginSuccess(staffData) {
  sessionStorage.setItem("vai_staff", JSON.stringify(staffData));
  showToast(`Welcome, ${staffData.name}`);
  setTimeout(() => {
    window.location.href =
      staffData.role === "manager" ? "../pages/manager-dashboard.html" : "../pages/dashboard.html";
  }, 1000);
}