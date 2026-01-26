/**
 * login.js - Login Modal Component
 * Handles login UI for pharmacy and admin users
 */

import { t, translatePage } from './i18n.js';
import {
    getSession,
    loginPharmacy,
    loginAdmin,
    signUpAdmin,
    logout,
    getPharmacyList,
    isAdmin as checkIsAdmin,
    initAuth
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

export async function initLogin(callback) {
    onLoginSuccess = callback;

    // Initialize Auth Listener
    initAuth((user) => {
        if (user && onLoginSuccess) {
            // If firebase user detected, ensure UI is updated
            // We can reload or just trigger callback depending on app flow
            // App.js typically checks getSession on load.
        }
    });

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

    return false;
}

function createLoginModal() {
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

                <!-- Setup/Signup Link (Only visible in Admin Mode) -->
                <button class="login-modal__link hidden" id="setupAdminLink" style="margin-top: 1rem; width: 100%; text-decoration: underline; background: none; border: none; cursor: pointer; color: var(--primary-color);">
                    Criar Conta / Aceitar Convite
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

function attachLoginListeners() {
    document.getElementById('pharmacyModeBtn')?.addEventListener('click', () => toggleMode(false));
    document.getElementById('adminModeBtn')?.addEventListener('click', () => toggleMode(true));
    loginBtn?.addEventListener('click', handleLogin);

    // Setup Link
    const setupLink = document.getElementById('setupAdminLink');
    if (setupLink) setupLink.addEventListener('click', renderSetupForm);

    pinInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    adminEmailInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') adminPasswordInput?.focus(); });
    adminPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });

    pinInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        if (e.target.value.length === 4) {
            loginBtn?.focus();
        }
    });
}

function toggleMode(admin) {
    isAdminMode = admin;
    document.getElementById('pharmacyModeBtn')?.classList.toggle('active', !admin);
    document.getElementById('adminModeBtn')?.classList.toggle('active', admin);
    pharmacyFields?.classList.toggle('hidden', admin);
    adminFields?.classList.toggle('hidden', !admin);

    // Show Signup link only in Admin mode
    const setupLink = document.getElementById('setupAdminLink');
    if (setupLink) setupLink.classList.toggle('hidden', !admin);

    hideError();
}

async function populatePharmacyDropdown() {
    if (!pharmacySelect) return;
    const pharmacies = await getPharmacyList();
    while (pharmacySelect.options.length > 1) {
        pharmacySelect.remove(1);
    }
    pharmacies.forEach(pharmacy => {
        const option = document.createElement('option');
        option.value = pharmacy.id;
        option.textContent = pharmacy.name;
        pharmacySelect.appendChild(option);
    });
    if (pharmacies.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.disabled = true;
        option.textContent = t('noPharmaciesAvailable') || 'Nenhuma farmácia disponível';
        pharmacySelect.appendChild(option);
    }
}

async function handleLogin() {
    hideError();
    loginBtn.disabled = true;
    loginBtn.textContent = t('loggingIn') || 'A entrar...';

    try {
        let result;

        if (isAdminMode) {
            const email = adminEmailInput?.value?.trim();
            const password = adminPasswordInput?.value;

            if (!email || !password) {
                showError(t('enterPassword') || 'Introduza email e senha');
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
            window.location.reload(); // Ensure session is clean
        } else {
            showError(getErrorMessage(result.error));
        }
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = t('login') || 'Entrar';
    }
}

function getErrorMessage(errorCode) {
    const messages = {
        'pharmacy_not_found': t('pharmacyNotFound') || 'Farmácia não encontrada',
        'pharmacy_inactive': t('pharmacyInactive') || 'Farmácia inativa',
        'invalid_pin': t('invalidPin') || 'PIN incorreto',
        'invalid_password': t('invalidPassword') || 'Senha incorreta',
        'auth/invalid-credential': 'Credenciais inválidas',
        'auth/user-not-found': 'Utilizador não encontrado',
        'auth/wrong-password': 'Senha incorreta',
        'network_error': t('networkError') || 'Erro de rede'
    };
    return messages[errorCode] || errorCode || t('unknownError') || 'Erro desconhecido';
}

function showError(message) {
    if (loginError) {
        loginError.classList.remove('hidden');
        const errorText = document.getElementById('loginErrorText');
        if (errorText) errorText.textContent = message;
    }
}

function hideError() {
    loginError?.classList.add('hidden');
}

function showLoginModal() {
    loginModal?.classList.add('visible');
    // Default to pharmacy mode
    toggleMode(false);
}

function hideLoginModal() {
    loginModal?.classList.remove('visible');
}

function updateLoginUI() {
    const isAdmin = checkIsAdmin();
    const session = getSession();

    if (!isAdmin && session && session.name) {
        const pharmacyNameEl = document.getElementById('pharmacyName');
        if (pharmacyNameEl) {
            pharmacyNameEl.textContent = session.name;
        }
    }

    document.body.classList.add('logged-in');
    if (isAdmin) {
        document.body.classList.add('is-admin');
    }

    createLogoutButton();
}

function createLogoutButton() {
    if (document.getElementById('logoutBtn')) return;
    const headerActions = document.querySelector('.header__actions');
    if (!headerActions) return;
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'logoutBtn';
    logoutBtn.className = 'header__icon-btn';
    logoutBtn.innerHTML = '<span class="material-symbols-outlined">logout</span>';
    logoutBtn.addEventListener('click', logout);
    const avatar = headerActions.querySelector('.header__avatar');
    headerActions.insertBefore(logoutBtn, avatar);
}

export function showLogin() {
    createLoginModal();
    populatePharmacyDropdown();
    showLoginModal();
}

// ==========================================
// Setup/Signup Flow
// ==========================================

function renderSetupForm() {
    const modalBody = document.querySelector('.login-modal__body');
    if (!modalBody) return;

    modalBody.innerHTML = `
        <h3 style="text-align: center; margin-bottom: 1.5rem; color: var(--primary-color);">Criar Conta</h3>
        <p style="text-align: center; margin-bottom: 1rem; font-size: 0.9rem; color: #666;">
            Apenas para emails convidados pelo administrador.
        </p>
        
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
                <label class="login-modal__label">Nova Senha</label>
                <input type="password" class="login-modal__input" id="setupPassword" placeholder="Senha forte">
            </div>
        </div>

        <div class="login-modal__error hidden" id="setupError"></div>

        <button class="login-modal__submit-btn" id="setupSubmitBtn">Criar Conta</button>
        <button class="login-modal__submit-btn" id="setupBackBtn" style="background: transparent; color: #666; border: 1px solid #ddd; margin-top: 0.5rem;">Voltar</button>
    `;

    document.getElementById('setupSubmitBtn').onclick = handleSetupSubmit;
    document.getElementById('setupBackBtn').onclick = () => {
        window.location.reload();
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

    const result = await signUpAdmin(name, email, password);

    if (result.success) {
        // Auto login handled by initAuth listener usually, but reload ensures state
        window.location.reload();
    } else {
        btn.disabled = false;
        btn.textContent = 'Criar Conta';
        if (errorEl) {
            let msg = 'Erro ao criar conta.';
            if (result.error === 'permission-denied') msg = 'Email não convidado ou já registado.';
            if (result.error === 'auth/email-already-in-use') msg = 'Email já está em uso.';
            if (result.error === 'auth/weak-password') msg = 'A senha deve ter 6+ caracteres.';
            errorEl.textContent = msg + ` (${result.error})`;
            errorEl.classList.remove('hidden');
        }
    }
}
