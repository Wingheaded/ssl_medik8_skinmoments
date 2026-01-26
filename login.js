/**
 * login.js - Login Modal Component
 * Handles login UI for pharmacy and admin users
 */

import { t, translatePage } from './i18n.js';
import {
    getSession,
    loginPharmacy,
    loginAdmin,
    logout,
    getPharmacyList,
    isAdmin as checkIsAdmin,
    getPharmacy,
    checkAnyAdmins,
    registerFirstAdmin
} from './auth.js';

// ==========================================
// DOM Elements
// ==========================================

let loginModal = null;
let pharmacySelect = null;
let pinInput = null;
let adminEmailInput = null;
let adminPasswordInput = null;
let loginError = null;
let loginBtn = null;
let adminToggle = null;
let pharmacyFields = null;
let adminFields = null;

// ==========================================
// State
// ==========================================

let isAdminMode = false;
let onLoginSuccess = null;

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize login modal and check existing session
 * @param {Function} callback - Called after successful login
 * @returns {boolean} - True if already logged in
 */
export async function initLogin(callback) {
    onLoginSuccess = callback;

    // Check existing session
    const session = getSession();
    if (session) {
        updateLoginUI();
        return true;
    }

    // Create and show login modal
    createLoginModal();
    await populatePharmacyDropdown();
    showLoginModal();
    initSetupCheck();

    return false;
}

/**
 * Create login modal DOM
 */
function createLoginModal() {
    // Check if already exists
    if (document.getElementById('loginModal')) {
        cacheLoginElements();
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'loginModal';
    modal.className = 'login-modal';
    modal.innerHTML = `
        <div class="login-modal__backdrop"></div>
        <div class="login-modal__content">
            <div class="login-modal__header">
                <img src="./assets/medik8-logo.svg" alt="Medik8" class="login-modal__logo">
                <h2 class="login-modal__title" data-i18n="loginTitle">Skin Moments Scheduler</h2>
                <p class="login-modal__subtitle" data-i18n="loginSubtitle">Faça login para continuar</p>
            </div>
            
            <div class="login-modal__body">
                <!-- Mode Toggle -->
                <div class="login-modal__toggle">
                    <button class="login-modal__toggle-btn active" id="pharmacyModeBtn" data-i18n="pharmacy">Farmácia</button>
                    <button class="login-modal__toggle-btn" id="adminModeBtn" data-i18n="admin">Admin</button>
                </div>
                
                <!-- Pharmacy Login Fields -->
                <div class="login-modal__fields" id="pharmacyFields">
                    <div class="login-modal__field">
                        <label class="login-modal__label" data-i18n="selectPharmacy">Selecione a Farmácia</label>
                        <select class="login-modal__select" id="pharmacySelect">
                            <option value="" disabled selected data-i18n="selectPharmacyPlaceholder">Escolha uma farmácia...</option>
                        </select>
                    </div>
                    <div class="login-modal__field">
                        <label class="login-modal__label" data-i18n="pin">PIN</label>
                        <input type="password" class="login-modal__input" id="pinInput" 
                               maxlength="4" pattern="[0-9]{4}" inputmode="numeric"
                               placeholder="••••" autocomplete="off">
                    </div>
                </div>
                
                <!-- Admin Login Fields -->
                <div class="login-modal__fields hidden" id="adminFields">
                    <div class="login-modal__field">
                        <label class="login-modal__label" data-i18n="email">Email</label>
                        <input type="email" class="login-modal__input" id="adminEmailInput" 
                               placeholder="admin@medik8.pt" autocomplete="email">
                    </div>
                    <div class="login-modal__field">
                        <label class="login-modal__label" data-i18n="adminPassword">Senha</label>
                        <input type="password" class="login-modal__input" id="adminPasswordInput" 
                               placeholder="••••••••" autocomplete="current-password">
                    </div>
                </div>
                
                <!-- Error Message -->
                <div class="login-modal__error hidden" id="loginError">
                    <span class="material-symbols-outlined">error</span>
                    <span id="loginErrorText"></span>
                </div>
                
                <!-- Submit Button -->
                <button class="login-modal__submit-btn" id="loginBtn" data-i18n="login">Entrar</button>

                <!-- Setup First Admin Link -->
                <button class="login-modal__link hidden" id="setupAdminLink" style="margin-top: 1rem; width: 100%; text-decoration: underline; background: none; border: none; cursor: pointer; color: var(--primary-color);">
                    Configurar Primeiro Acesso
                </button>
            </div>
            
            <div class="login-modal__footer">
                <img src="./assets/SKIN SELF LOVE_LOGO_HORIZONTAL_MANCHA_RGB.png" alt="Skin Self Love" class="login-modal__brand">
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    cacheLoginElements();
    attachLoginListeners();
    translatePage();
}

/**
 * Cache login modal elements
 */
function cacheLoginElements() {
    loginModal = document.getElementById('loginModal');
    pharmacySelect = document.getElementById('pharmacySelect');
    pinInput = document.getElementById('pinInput');
    adminEmailInput = document.getElementById('adminEmailInput');
    adminPasswordInput = document.getElementById('adminPasswordInput');
    loginError = document.getElementById('loginError');
    loginBtn = document.getElementById('loginBtn');
    pharmacyFields = document.getElementById('pharmacyFields');
    adminFields = document.getElementById('adminFields');
}

/**
 * Attach event listeners to login modal
 */
function attachLoginListeners() {
    // Mode toggle
    document.getElementById('pharmacyModeBtn')?.addEventListener('click', () => toggleMode(false));
    document.getElementById('adminModeBtn')?.addEventListener('click', () => toggleMode(true));

    // Login button
    loginBtn?.addEventListener('click', handleLogin);

    // Enter key on inputs
    pinInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    adminEmailInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') adminPasswordInput?.focus(); });
    adminPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });

    // PIN input: auto-advance when 4 digits entered
    pinInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        if (e.target.value.length === 4) {
            loginBtn?.focus();
        }
    });
}

/**
 * Toggle between pharmacy and admin mode
 */
function toggleMode(admin) {
    isAdminMode = admin;

    document.getElementById('pharmacyModeBtn')?.classList.toggle('active', !admin);
    document.getElementById('adminModeBtn')?.classList.toggle('active', admin);

    pharmacyFields?.classList.toggle('hidden', admin);
    adminFields?.classList.toggle('hidden', !admin);

    hideError();
}

/**
 * Populate pharmacy dropdown from Firestore
 */
async function populatePharmacyDropdown() {
    if (!pharmacySelect) return;

    const pharmacies = await getPharmacyList();

    // Clear existing options except the placeholder
    while (pharmacySelect.options.length > 1) {
        pharmacySelect.remove(1);
    }

    pharmacies.forEach(pharmacy => {
        const option = document.createElement('option');
        option.value = pharmacy.id;
        option.textContent = pharmacy.name;
        pharmacySelect.appendChild(option);
    });

    // If no pharmacies, show message
    if (pharmacies.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.disabled = true;
        option.textContent = t('noPharmaciesAvailable') || 'Nenhuma farmácia disponível';
        pharmacySelect.appendChild(option);
    }
}

/**
 * Handle login button click
 */
async function handleLogin() {
    hideError();
    loginBtn.disabled = true;
    loginBtn.textContent = t('loggingIn') || 'A entrar...';

    try {
        let result;

        if (isAdminMode) {
            const email = adminEmailInput?.value?.trim() || 'admin'; // Fallback for legacy calls if hidden/empty
            const password = adminPasswordInput?.value;

            if (!password) {
                showError(t('enterPassword') || 'Introduza a senha');
                return;
            }
            result = await loginAdmin(email, password);
        } else {
            const pharmacyId = pharmacySelect?.value;
            const pin = pinInput?.value;

            if (!pharmacyId) {
                showError(t('selectPharmacyError') || 'Selecione uma farmácia');
                return;
            }
            if (!pin || pin.length !== 4) {
                showError(t('enterPinError') || 'Introduza o PIN de 4 dígitos');
                return;
            }

            result = await loginPharmacy(pharmacyId, pin);
        }

        if (result.success) {
            hideLoginModal();
            updateLoginUI();
            onLoginSuccess?.();
        } else {
            showError(getErrorMessage(result.error));
        }
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = t('login') || 'Entrar';
    }
}

/**
 * Get localized error message
 */
function getErrorMessage(errorCode) {
    const messages = {
        'pharmacy_not_found': t('pharmacyNotFound') || 'Farmácia não encontrada',
        'pharmacy_inactive': t('pharmacyInactive') || 'Farmácia inativa',
        'invalid_pin': t('invalidPin') || 'PIN incorreto',
        'invalid_password': t('invalidPassword') || 'Senha incorreta',
        'admin_not_configured': t('adminNotConfigured') || 'Admin não configurado',
        'user_not_found': t('userNotFound') || 'Utilizador não encontrado',
        'network_error': t('networkError') || 'Erro de rede'
    };
    return messages[errorCode] || t('unknownError') || 'Erro desconhecido';
}

/**
 * Show error message
 */
function showError(message) {
    if (loginError) {
        loginError.classList.remove('hidden');
        const errorText = document.getElementById('loginErrorText');
        if (errorText) errorText.textContent = message;
    }
}

/**
 * Hide error message
 */
function hideError() {
    loginError?.classList.add('hidden');
}

/**
 * Show login modal
 */
function showLoginModal() {
    loginModal?.classList.add('visible');
    // Clear inputs
    if (pharmacySelect) pharmacySelect.selectedIndex = 0;
    if (pinInput) pinInput.value = '';
    if (adminEmailInput) adminEmailInput.value = '';
    if (adminPasswordInput) adminPasswordInput.value = '';
    hideError();
}

/**
 * Hide login modal
 */
function hideLoginModal() {
    loginModal?.classList.remove('visible');
}

/**
 * Update UI after login (show logged-in state in header)
 */
function updateLoginUI() {
    const isAdmin = checkIsAdmin();
    const pharmacy = getPharmacy();

    // Update pharmacy name in header if pharmacy user
    if (!isAdmin && pharmacy) {
        const pharmacyNameEl = document.getElementById('pharmacyName');
        if (pharmacyNameEl) {
            pharmacyNameEl.textContent = pharmacy.pharmacyName;
        }
    }

    // Add logged-in class to body
    document.body.classList.add('logged-in');
    if (isAdmin) {
        document.body.classList.add('is-admin');
    }

    // Create logout button in header if not exists
    createLogoutButton();
}

/**
 * Create logout button in header
 */
function createLogoutButton() {
    if (document.getElementById('logoutBtn')) return;

    const headerActions = document.querySelector('.header__actions');
    if (!headerActions) return;

    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'logoutBtn';
    logoutBtn.className = 'header__icon-btn';
    logoutBtn.setAttribute('aria-label', t('logout') || 'Sair');
    logoutBtn.innerHTML = '<span class="material-symbols-outlined">logout</span>';
    logoutBtn.addEventListener('click', logout);

    // Insert before the avatar
    const avatar = headerActions.querySelector('.header__avatar');
    headerActions.insertBefore(logoutBtn, avatar);
}

/**
 * Show login modal (for re-login after logout)
 */
export function showLogin() {
    createLoginModal();
    populatePharmacyDropdown();
    showLoginModal();
}

// ==========================================
// Setup Flow (First Admin)
// ==========================================

async function initSetupCheck() {
    const hasAdmins = await checkAnyAdmins();
    const setupLink = document.getElementById('setupAdminLink');
    if (!hasAdmins && setupLink) {
        setupLink.classList.remove('hidden');
        setupLink.onclick = renderSetupForm;
    }
}

function renderSetupForm() {
    const modalBody = document.querySelector('.login-modal__body');
    if (!modalBody) return;

    modalBody.innerHTML = `
        <h3 style="text-align: center; margin-bottom: 1.5rem; color: var(--primary-color);">Configuração Inicial</h3>
        <p style="text-align: center; margin-bottom: 1rem; font-size: 0.9rem; color: #666;">Crie a primeira conta de administrador para aceder ao sistema.</p>
        
        <div class="login-modal__fields">
            <div class="login-modal__field">
                <label class="login-modal__label">Nome</label>
                <input type="text" class="login-modal__input" id="setupName" placeholder="Seu Nome">
            </div>
            <div class="login-modal__field">
                <label class="login-modal__label">Email</label>
                <input type="email" class="login-modal__input" id="setupEmail" placeholder="seu.email@exemplo.com">
            </div>
            <div class="login-modal__field">
                <label class="login-modal__label">Senha</label>
                <input type="password" class="login-modal__input" id="setupPassword" placeholder="Senha forte">
            </div>
        </div>

        <div class="login-modal__error hidden" id="setupError"></div>

        <button class="login-modal__submit-btn" id="setupSubmitBtn">Criar Conta</button>
        <button class="login-modal__submit-btn" id="setupBackBtn" style="background: transparent; color: #666; border: 1px solid #ddd; margin-top: 0.5rem;">Voltar</button>
    `;

    document.getElementById('setupSubmitBtn').onclick = handleSetupSubmit;
    document.getElementById('setupBackBtn').onclick = () => {
        window.location.reload(); // Simple reload to restore login form
    };
}

async function handleSetupSubmit() {
    const name = document.getElementById('setupName').value;
    const email = document.getElementById('setupEmail').value;
    const password = document.getElementById('setupPassword').value;
    const btn = document.getElementById('setupSubmitBtn');
    const errorEl = document.getElementById('setupError');

    if (!name || !email || !password) {
        if (errorEl) {
            errorEl.textContent = 'Preencha todos os campos';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    btn.disabled = true;
    btn.textContent = 'A criar conta...';

    const result = await registerFirstAdmin(name, email, password);

    if (result.success) {
        window.location.reload(); // Reload to pick up session
    } else {
        btn.disabled = false;
        btn.textContent = 'Criar Conta';
        if (errorEl) {
            errorEl.textContent = 'Erro ao criar conta: ' + (result.error || 'Erro desconhecido');
            errorEl.classList.remove('hidden');
        }
    }
}

