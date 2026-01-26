/**
 * notify.js - Unified notification and dialog system
 * Replaces browser alert() and confirm() with styled modals
 */

// ==========================================
// Toast Notifications
// ==========================================

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {'info'|'success'|'warning'|'error'} type - Toast type
 * @param {number} duration - Duration in ms (default 3000)
 */
export function showToast(message, type = 'info', duration = 3000) {
    // Remove existing toast
    document.querySelector('.notify-toast')?.remove();

    const iconMap = {
        info: 'info',
        success: 'check_circle',
        warning: 'warning',
        error: 'error'
    };

    const toast = document.createElement('div');
    toast.className = `notify-toast notify-toast--${type}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined">${iconMap[type]}</span>
        <span class="notify-toast__message">${message}</span>
    `;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('visible'));

    // Remove after duration
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ==========================================
// Alert Dialog (replaces alert())
// ==========================================

/**
 * Show an alert dialog
 * @param {string} message - The message to display
 * @param {string} title - Optional title
 * @returns {Promise<void>}
 */
export function showAlert(message, title = '') {
    return new Promise((resolve) => {
        // Remove existing dialog
        document.querySelector('.notify-dialog')?.remove();

        const dialog = document.createElement('div');
        dialog.className = 'notify-dialog';
        dialog.innerHTML = `
            <div class="notify-dialog__backdrop"></div>
            <div class="notify-dialog__content notify-dialog__content--alert">
                ${title ? `<h3 class="notify-dialog__title">${title}</h3>` : ''}
                <p class="notify-dialog__message">${message}</p>
                <div class="notify-dialog__actions">
                    <button class="notify-dialog__btn notify-dialog__btn--primary" data-action="ok">OK</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
        requestAnimationFrame(() => dialog.classList.add('visible'));

        // Focus the OK button
        dialog.querySelector('[data-action="ok"]').focus();

        const closeDialog = () => {
            dialog.classList.remove('visible');
            setTimeout(() => {
                dialog.remove();
                resolve();
            }, 200);
        };

        dialog.querySelector('[data-action="ok"]').addEventListener('click', closeDialog);
        dialog.querySelector('.notify-dialog__backdrop').addEventListener('click', closeDialog);

        // ESC key closes
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeDialog();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    });
}

// ==========================================
// Confirm Dialog (replaces confirm())
// ==========================================

/**
 * Show a confirm dialog
 * @param {string} message - The message to display
 * @param {Object} options - Options
 * @param {string} options.title - Dialog title
 * @param {string} options.confirmText - Confirm button text (default: 'Confirmar')
 * @param {string} options.cancelText - Cancel button text (default: 'Cancelar')
 * @param {'primary'|'danger'} options.confirmStyle - Confirm button style
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, options = {}) {
    const {
        title = '',
        confirmText = 'Confirmar',
        cancelText = 'Cancelar',
        confirmStyle = 'primary'
    } = options;

    return new Promise((resolve) => {
        // Remove existing dialog
        document.querySelector('.notify-dialog')?.remove();

        const dialog = document.createElement('div');
        dialog.className = 'notify-dialog';
        dialog.innerHTML = `
            <div class="notify-dialog__backdrop"></div>
            <div class="notify-dialog__content">
                ${title ? `<h3 class="notify-dialog__title">${title}</h3>` : ''}
                <p class="notify-dialog__message">${message}</p>
                <div class="notify-dialog__actions">
                    <button class="notify-dialog__btn notify-dialog__btn--outline" data-action="cancel">${cancelText}</button>
                    <button class="notify-dialog__btn notify-dialog__btn--${confirmStyle}" data-action="confirm">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
        requestAnimationFrame(() => dialog.classList.add('visible'));

        // Focus the cancel button (safer default)
        dialog.querySelector('[data-action="cancel"]').focus();

        const closeDialog = (result) => {
            dialog.classList.remove('visible');
            setTimeout(() => {
                dialog.remove();
                resolve(result);
            }, 200);
        };

        dialog.querySelector('[data-action="confirm"]').addEventListener('click', () => closeDialog(true));
        dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => closeDialog(false));
        dialog.querySelector('.notify-dialog__backdrop').addEventListener('click', () => closeDialog(false));

        // ESC key closes with false
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeDialog(false);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    });
}

// ==========================================
// Loading Overlay
// ==========================================

let loadingOverlay = null;

/**
 * Show a loading overlay
 * @param {string} message - Loading message
 */
export function showLoading(message = 'A processar...') {
    hideLoading();

    loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'notify-loading';
    loadingOverlay.innerHTML = `
        <div class="notify-loading__content">
            <div class="notify-loading__spinner"></div>
            <p class="notify-loading__message">${message}</p>
        </div>
    `;

    document.body.appendChild(loadingOverlay);
    requestAnimationFrame(() => loadingOverlay.classList.add('visible'));
}

/**
 * Hide the loading overlay
 */
export function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.remove('visible');
        setTimeout(() => {
            loadingOverlay?.remove();
            loadingOverlay = null;
        }, 200);
    }
}
