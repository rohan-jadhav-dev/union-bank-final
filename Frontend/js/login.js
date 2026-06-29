// ===================== ELEMENT REFERENCES =====================
const loginForm = document.getElementById('loginForm');
const empIdInput = document.getElementById('empId');
const passwordInput = document.getElementById('password');
const empIdError = document.getElementById('empIdError');
const passwordError = document.getElementById('passwordError');
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

let isVerified = false;
let isVerifying = false;

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
  errorEl.textContent = message;
  errorEl.classList.add('show');
}

empIdInput.addEventListener('input', () => clearFieldError(empIdInput, empIdError));
passwordInput.addEventListener('input', () => clearFieldError(passwordInput, passwordError));

// ===================== SECURITY CHECK =====================
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

// ===================== FORM SUBMIT =====================
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
    btnText.textContent = 'Sign in';
    submitBtn.disabled = false;
    showToast('Signed in successfully');
    // ✅ Redirect to dashboard
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
  }, 1400);
});