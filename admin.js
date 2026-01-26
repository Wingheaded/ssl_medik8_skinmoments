/**
 * admin.js - Admin Dashboard Logic
 * Pharmacy management, date assignment, and reservation overview
 */

import { db } from './firebase-config.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getSession, loginAdmin, logout, isAdmin } from './auth.js';

// ==========================================
// Inlined Notifications (notify.js)
// ==========================================

function showToast(message, type = 'info', duration = 3000) {
    // Remove existing toast
    document.querySelector('.admin-toast')?.remove();

    const iconMap = {
        info: 'info',
        success: 'check_circle',
        warning: 'warning',
        error: 'error'
    };

    const toast = document.createElement('div');
    toast.className = `admin-toast admin-toast--${type}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined">${iconMap[type]}</span>
        <span class="notify-toast__message">${message}</span>
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function showAlert(message, title = '') {
    return new Promise((resolve) => {
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
    });
}

function showConfirm(message, options = {}) {
    const {
        title = '',
        confirmText = 'Confirmar',
        cancelText = 'Cancelar',
        confirmStyle = 'primary'
    } = options;

    return new Promise((resolve) => {
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

        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeDialog(false);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    });
}

let loadingOverlay = null;

function showLoading(message = 'A processar...') {
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

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.remove('visible');
        setTimeout(() => {
            loadingOverlay?.remove();
            loadingOverlay = null;
        }, 200);
    }
}

// ==========================================
// State
// ==========================================

let pharmacies = [];
let admins = [];
let pharmaciesById = {};
let dateAssignments = {};
let reservations = [];
let selectedDates = [];
let dateAssignmentCalendar = null;

// ==========================================
// Initialization
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Check admin session
    const session = getSession();

    if (!session || !session.isAdmin) {
        // Show admin login
        showAdminLogin();
        return;
    }

    initializeAdmin();
});

/**
 * Show admin login prompt
 */
function showAdminLogin() {
    window.location.href = './index.html';
    return;
    const password = null; // Removed prompt
    if (!password) {
        window.location.href = './index.html';
        return;
    }

    loginAdmin(password).then(result => {
        if (result.success) {
            initializeAdmin();
        } else {
            showToast('Senha incorreta', 'error');
            showAdminLogin();
        }
    });
}

/**
 * Initialize admin dashboard
 */
async function initializeAdmin() {
    initTheme();
    initNavigation();
    initModals();
    initDateAssignmentCalendar();

    // Load data
    await loadPharmacies();
    await loadDateAssignments();
    await loadReservations();

    // Event listeners
    // Event listeners
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.getElementById('addPharmacyBtn')?.addEventListener('click', () => openPharmacyModal());
    document.getElementById('addFirstPharmacyBtn')?.addEventListener('click', () => openPharmacyModal());
    document.getElementById('assignDatesBtn')?.addEventListener('click', assignDates);

    // Admin management listeners
    document.getElementById('addAdminBtn')?.addEventListener('click', () => openAdminUserModal());
    document.getElementById('saveAdminUserBtn')?.addEventListener('click', saveAdminUser);
    document.getElementById('cancelAdminUserModal')?.addEventListener('click', closeAdminUserModal);
    document.getElementById('closeAdminUserModal')?.addEventListener('click', closeAdminUserModal);

    // Initial load for admin management
    await loadAdmins();
}

// ==========================================
// Theme
// ==========================================

function initTheme() {
    const THEME_KEY = 'skin-moments-theme';
    let theme = localStorage.getItem(THEME_KEY) || 'light';
    setTheme(theme);

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        theme = theme === 'dark' ? 'light' : 'dark';
        setTheme(theme);
        localStorage.setItem(THEME_KEY, theme);
    });
}

function setTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.getElementById('themeIcon').textContent = 'light_mode';
    } else {
        document.documentElement.classList.remove('dark');
        document.getElementById('themeIcon').textContent = 'dark_mode';
    }
}

// ==========================================
// Navigation
// ==========================================

function initNavigation() {
    const navItems = document.querySelectorAll('.admin-nav__item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;

            // Update active nav item
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Update visible section
            document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`${section}Section`)?.classList.add('active');
        });
    });
}

// ==========================================
// Pharmacy Management
// ==========================================

async function loadPharmacies() {
    try {
        const pharmaciesRef = collection(db, 'pharmacies');
        const snapshot = await getDocs(pharmaciesRef);

        pharmacies = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        pharmaciesById = buildPharmacyMap(pharmacies);

        renderPharmaciesTable();
        populatePharmacyDropdowns();
    } catch (error) {
        console.error('Error loading pharmacies:', error);
    }
}

function renderPharmaciesTable() {
    const tbody = document.getElementById('pharmaciesTableBody');
    const empty = document.getElementById('pharmaciesEmpty');

    if (pharmacies.length === 0) {
        tbody.innerHTML = '';
        empty?.classList.remove('hidden');
        return;
    }

    empty?.classList.add('hidden');

    tbody.innerHTML = pharmacies.map(pharmacy => `
        <tr>
            <td><strong>${pharmacy.name}</strong></td>
            <td>${pharmacy.contact || '-'}</td>
            <td><code>${pharmacy.pin}</code></td>
            <td>
                <span class="admin-badge ${pharmacy.active ? 'admin-badge--success' : 'admin-badge--muted'}">
                    ${pharmacy.active ? 'Ativa' : 'Inativa'}
                </span>
            </td>
            <td>
                <div class="admin-actions">
                    <button class="admin-action-btn" onclick="editPharmacy('${pharmacy.id}')" title="Editar">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button class="admin-action-btn admin-action-btn--danger" onclick="deletePharmacy('${pharmacy.id}')" title="Eliminar">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function populatePharmacyDropdowns() {
    const activePharmacies = pharmacies.filter(p => p.active);

    const assignSelect = document.getElementById('assignPharmacySelect');
    const filterSelect = document.getElementById('filterPharmacy');

    if (assignSelect) {
        assignSelect.innerHTML = '<option value="" disabled selected>Escolha uma farmácia...</option>' +
            activePharmacies.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }

    if (filterSelect) {
        filterSelect.innerHTML = '<option value="">Todas as Farmácias</option>' +
            activePharmacies.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }
}

function buildPharmacyMap(list) {
    return list.reduce((acc, pharmacy) => {
        acc[pharmacy.id] = pharmacy;
        return acc;
    }, {});
}

// ==========================================
// Pharmacy Modal
// ==========================================

function initModals() {
    const pharmacyModal = document.getElementById('pharmacyModal');

    document.getElementById('closePharmacyModal')?.addEventListener('click', closePharmacyModal);
    document.getElementById('cancelPharmacyModal')?.addEventListener('click', closePharmacyModal);
    document.getElementById('savePharmacyBtn')?.addEventListener('click', savePharmacy);

    // Close on backdrop click
    pharmacyModal?.querySelector('.admin-modal__backdrop')?.addEventListener('click', closePharmacyModal);
}

function openPharmacyModal(pharmacyId = null) {
    const modal = document.getElementById('pharmacyModal');
    const title = document.getElementById('pharmacyModalTitle');

    if (pharmacyId) {
        const pharmacy = pharmacies.find(p => p.id === pharmacyId);
        if (pharmacy) {
            title.textContent = 'Editar Farmácia';
            document.getElementById('pharmacyId').value = pharmacyId;
            document.getElementById('pharmacyNameInput').value = pharmacy.name;
            document.getElementById('pharmacyContactInput').value = pharmacy.contact || '';
            document.getElementById('pharmacyPinInput').value = pharmacy.pin;
            document.getElementById('pharmacyActiveInput').checked = pharmacy.active;
        }
    } else {
        title.textContent = 'Nova Farmácia';
        document.getElementById('pharmacyId').value = '';
        document.getElementById('pharmacyNameInput').value = '';
        document.getElementById('pharmacyContactInput').value = '';
        document.getElementById('pharmacyPinInput').value = '';
        document.getElementById('pharmacyActiveInput').checked = true;
    }

    modal?.classList.remove('hidden');
}

function closePharmacyModal() {
    document.getElementById('pharmacyModal')?.classList.add('hidden');
}

async function savePharmacy() {
    const pharmacyId = document.getElementById('pharmacyId').value;
    const name = document.getElementById('pharmacyNameInput').value.trim();
    const contact = document.getElementById('pharmacyContactInput').value.trim();
    const pin = document.getElementById('pharmacyPinInput').value.trim();
    const active = document.getElementById('pharmacyActiveInput').checked;

    if (!name) {
        showToast('Nome é obrigatório', 'warning');
        return;
    }

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        showToast('PIN deve ter 4 dígitos', 'warning');
        return;
    }

    try {
        const docId = pharmacyId || `pharmacy_${Date.now()}`;
        await setDoc(doc(db, 'pharmacies', docId), {
            name,
            contact,
            pin,
            active,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        // Update denormalized names in associated collections if editing
        if (pharmacyId) {
            console.log(`[Admin] Updating pharmacy name for ID: ${pharmacyId} to "${name}"`);
            const updates = [];

            // 1. Date Assignments
            try {
                const assignmentsRef = collection(db, 'dateAssignments');
                const q = query(assignmentsRef, where('pharmacyId', '==', docId));
                const snapshot = await getDocs(q);
                console.log(`[Admin] Found ${snapshot.size} assignments to update in dateAssignments.`);

                snapshot.docs.forEach(d => {
                    updates.push(updateDoc(d.ref, { pharmacyName: name }));
                });
            } catch (err) {
                console.error("[Admin] Error query/update assignments:", err);
            }

            // 2. Schedules (root pharmacyName)
            try {
                const schedulesRef = collection(db, 'schedules');
                const q2 = query(schedulesRef, where('pharmacyId', '==', docId));
                const snap2 = await getDocs(q2);
                console.log(`[Admin] Found ${snap2.size} schedules to update in schedules.`);

                snap2.docs.forEach(d => {
                    updates.push(updateDoc(d.ref, { pharmacyName: name }));
                });
            } catch (err) {
                console.error("[Admin] Error query/update schedules:", err);
            }

            if (updates.length > 0) {
                await Promise.all(updates);
                console.log(`[Admin] Successfully executed ${updates.length} updates.`);
            } else {
                console.log("[Admin] No updates needed.");
            }
        }

        closePharmacyModal();
        await loadPharmacies();
        await loadDateAssignments(); // Refresh calendar tooltips
        showToast('Farmácia guardada e atribuições atualizadas', 'success');
    } catch (error) {
        console.error('Error saving pharmacy:', error);
        showToast('Erro ao guardar farmácia', 'error');
    }
}

// Global functions for inline onclick
window.editPharmacy = openPharmacyModal;

window.deletePharmacy = async function (pharmacyId) {
    const confirm = await showConfirm(
        'Tem certeza que deseja eliminar esta farmácia?',
        { confirmText: 'Eliminar', confirmStyle: 'danger' }
    );

    if (!confirm) return;

    try {
        await deleteDoc(doc(db, 'pharmacies', pharmacyId));
        await loadPharmacies();
        await loadDateAssignments();
        showToast('Farmácia eliminada', 'success');
    } catch (error) {
        console.error('Error deleting pharmacy:', error);
        showToast('Erro ao eliminar farmácia', 'error');
    }
};

// ==========================================
// Date Assignment
// ==========================================

function initDateAssignmentCalendar() {
    const container = document.getElementById('dateAssignmentCalendar');
    if (!container) return;

    dateAssignmentCalendar = flatpickr(container, {
        inline: true,
        mode: 'multiple',
        dateFormat: 'Y-m-d',
        minDate: 'today',
        onDayCreate: (dObj, dStr, fp, dayElem) => {
            const dateStr = formatLocalDate(dayElem.dateObj);
            const assignment = dateAssignments[dateStr];

            if (assignment) {
                // Mark as assigned with pharmacy name tooltip
                dayElem.classList.add('date-blocked');

                // Use custom tooltip instead of native title
                dayElem.setAttribute('data-pharmacy', assignment.pharmacyName);
                dayElem.removeAttribute('title'); // Ensure no native tooltip

                dayElem.addEventListener('mouseenter', (e) => {
                    const name = dayElem.getAttribute('data-pharmacy');
                    if (name) showTooltip(e, `Atribuído: <strong>${name}</strong>`);
                });
                dayElem.addEventListener('mouseleave', () => {
                    hideTooltip();
                });
                dayElem.addEventListener('mousemove', (e) => {
                    updateTooltipPosition(e);
                });

                // Make it visually blocked but keep pharmacy color indicator
                dayElem.style.setProperty('--pharmacy-color', getPharmacyColor(assignment.pharmacyId));
            }
        },
        onChange: (selectedDates, dateStr, instance) => {
            // Filter out any already-assigned dates from selection
            const validDates = selectedDates.filter(d => {
                const ds = formatLocalDate(d);
                return !dateAssignments[ds];
            });

            // If user tried to select blocked dates, show warning
            if (validDates.length < selectedDates.length) {
                const blockedCount = selectedDates.length - validDates.length;
                showToast(`${blockedCount} data(s) já atribuída(s) a outra farmácia`, 'warning');

                // Clear and re-select only valid dates
                instance.clear();
                if (validDates.length > 0) {
                    instance.setDate(validDates, true);
                }
            }

            updateSelectedDatesList();
            updateAssignButton();
        }
    });
}

/**
 * Generate a consistent color for each pharmacy
 */
function getPharmacyColor(pharmacyId) {
    const colors = [
        '#7B9E89', // Sage green (primary)
        '#5B8FB9', // Blue
        '#B97B5B', // Terracotta
        '#9B7BB9', // Purple
        '#B9A05B', // Gold
        '#5BB9A0', // Teal
        '#B95B8F', // Pink
    ];

    // Hash pharmacy ID to get consistent color
    let hash = 0;
    for (let i = 0; i < pharmacyId.length; i++) {
        hash = ((hash << 5) - hash) + pharmacyId.charCodeAt(i);
        hash = hash & hash;
    }

    return colors[Math.abs(hash) % colors.length];
}



function formatLocalDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function updateSelectedDatesList() {
    const list = document.getElementById('selectedDatesList');
    const dates = dateAssignmentCalendar?.selectedDates || [];

    if (dates.length === 0) {
        list.innerHTML = '<span class="selected-dates-empty">Clique no calendário para selecionar datas</span>';
        return;
    }

    list.innerHTML = dates.map(d => {
        const dateStr = formatLocalDate(d);
        return `<span class="selected-date-tag">${dateStr}</span>`;
    }).join('');
}

function updateAssignButton() {
    const btn = document.getElementById('assignDatesBtn');
    const pharmacySelect = document.getElementById('assignPharmacySelect');
    const dates = dateAssignmentCalendar?.selectedDates || [];

    btn.disabled = dates.length === 0 || !pharmacySelect.value;
}

async function loadDateAssignments() {
    try {
        const assignmentsRef = collection(db, 'dateAssignments');
        const snapshot = await getDocs(assignmentsRef);

        dateAssignments = {};
        snapshot.docs.forEach(doc => {
            dateAssignments[doc.id] = doc.data();
        });

        await reconcileAssignmentNames();
        renderAssignedDatesGrid();
        dateAssignmentCalendar?.redraw();
    } catch (error) {
        console.error('Error loading date assignments:', error);
    }
}

async function reconcileAssignmentNames() {
    const updates = [];

    Object.entries(dateAssignments).forEach(([date, data]) => {
        const pharmacy = pharmaciesById[data.pharmacyId];
        if (pharmacy && pharmacy.name && data.pharmacyName !== pharmacy.name) {
            const updated = { ...data, pharmacyName: pharmacy.name };
            dateAssignments[date] = updated;
            updates.push(setDoc(doc(db, 'dateAssignments', date), updated, { merge: true }));
        }
    });

    if (updates.length > 0) {
        try {
            await Promise.all(updates);
        } catch (err) {
            console.error('Error reconciling assignment names:', err);
        }
    }
}

function renderAssignedDatesGrid() {
    const grid = document.getElementById('assignedDatesGrid');
    const empty = document.getElementById('assignedDatesEmpty');
    const entries = Object.entries(dateAssignments);

    if (entries.length === 0) {
        grid.innerHTML = '';
        empty?.classList.remove('hidden');
        return;
    }

    empty?.classList.add('hidden');

    // Group by pharmacy
    const byPharmacy = {};
    entries.forEach(([date, data]) => {
        if (!byPharmacy[data.pharmacyId]) {
            byPharmacy[data.pharmacyId] = {
                name: data.pharmacyName,
                dates: []
            };
        }
        byPharmacy[data.pharmacyId].dates.push(date);
    });

    grid.innerHTML = Object.entries(byPharmacy).map(([id, data]) => `
        <div class="assigned-pharmacy-card">
            <h4>${data.name}</h4>
            <div class="assigned-dates-list">
                ${data.dates.sort().map(d => `
                    <span class="assigned-date-tag">
                        ${d}
                        <button class="remove-date-btn" onclick="removeAssignment('${d}')" title="Remover">×</button>
                    </span>
                `).join('')}
            </div>
        </div>
    `).join('');
}

async function assignDates() {
    const pharmacyId = document.getElementById('assignPharmacySelect').value;
    const dates = dateAssignmentCalendar?.selectedDates || [];

    if (!pharmacyId || dates.length === 0) return;

    const pharmacy = pharmacies.find(p => p.id === pharmacyId);
    if (!pharmacy) return;

    try {
        for (const date of dates) {
            const dateStr = formatLocalDate(date);
            await setDoc(doc(db, 'dateAssignments', dateStr), {
                pharmacyId,
                pharmacyName: pharmacy.name,
                date: dateStr,
                assignedAt: new Date().toISOString()
            });
        }

        // Clear selection
        dateAssignmentCalendar?.clear();
        document.getElementById('assignPharmacySelect').selectedIndex = 0;
        updateSelectedDatesList();
        updateAssignButton();

        loadDateAssignments();
        showToast(`${dates.length} data(s) atribuída(s) a ${pharmacy.name}`, 'success');
    } catch (error) {
        console.error('Error assigning dates:', error);
        showToast('Erro ao atribuir datas', 'error');
    }
}

window.removeAssignment = async function (dateStr) {
    const confirm = await showConfirm(
        `Remover atribuição de ${dateStr}?`,
        { confirmText: 'Remover', confirmStyle: 'danger' }
    );

    if (!confirm) return;

    try {
        await deleteDoc(doc(db, 'dateAssignments', dateStr));
        loadDateAssignments();
        showToast('Atribuição removida', 'success');
    } catch (error) {
        console.error('Error removing assignment:', error);
        showToast('Erro ao remover atribuição', 'error');
    }
};

// ==========================================
// Reservations
// ==========================================

let allReservations = []; // Store all reservations for filtering

async function loadReservations() {
    try {
        // Load schedules
        const schedulesRef = collection(db, 'schedules');
        const snapshot = await getDocs(schedulesRef);

        allReservations = [];
        snapshot.docs.forEach(docSnap => {
            const dateStr = docSnap.id;
            const data = docSnap.data();

            // Extract appointments from schedule
            if (data.appointments) {
                Object.entries(data.appointments).forEach(([blockId, apt]) => {
                    // Safety check for null/undefined appointments (legacy data gaps)
                    if (!apt) return;

                    // Get pharmacy info from:
                    // 1. The appointment itself (new system)
                    // 2. The schedule's pharmacy (new system)
                    // 3. The dateAssignments collection (fallback)
                    let pharmacyId = apt.pharmacyId || data.pharmacyId || null;
                    let pharmacyName = apt.pharmacyName || data.pharmacyName || null;

                    // Fallback to dateAssignments
                    if (!pharmacyName && dateAssignments[dateStr]) {
                        pharmacyId = dateAssignments[dateStr].pharmacyId;
                        pharmacyName = dateAssignments[dateStr].pharmacyName;
                    }

                    allReservations.push({
                        id: `${dateStr}_${blockId}`,
                        date: dateStr,
                        timeSlot: apt.time || blockId,
                        pharmacyId: pharmacyId || 'unknown',
                        pharmacyName: pharmacyName || 'Sem farmácia',
                        clientName: apt.name || 'N/A',
                        clientContact: apt.contact || '',
                        status: apt.status || 'scheduled'
                    });
                });
            }
        });

        // Sort by date descending
        allReservations.sort((a, b) => b.date.localeCompare(a.date));

        // Apply filters and render
        filterAndRenderReservations();

        // Setup filter event listeners
        setupReservationFilters();
    } catch (error) {
        console.error('Error loading reservations:', error);
    }
}

function setupReservationFilters() {
    const pharmacyFilter = document.getElementById('filterPharmacy');
    const dateFilter = document.getElementById('filterDate');

    pharmacyFilter?.removeEventListener('change', filterAndRenderReservations);
    dateFilter?.removeEventListener('change', filterAndRenderReservations);

    pharmacyFilter?.addEventListener('change', filterAndRenderReservations);
    dateFilter?.addEventListener('change', filterAndRenderReservations);
}

function filterAndRenderReservations() {
    const pharmacyFilter = document.getElementById('filterPharmacy')?.value || '';
    const dateFilter = document.getElementById('filterDate')?.value || '';

    let filtered = [...allReservations];

    // Filter by pharmacy
    if (pharmacyFilter) {
        filtered = filtered.filter(r => r.pharmacyId === pharmacyFilter);
    }

    // Filter by date
    if (dateFilter) {
        filtered = filtered.filter(r => r.date === dateFilter);
    }

    renderReservationsTable(filtered);
}

function renderReservationsTable(reservationsToRender = allReservations) {
    const tbody = document.getElementById('reservationsTableBody');
    const empty = document.getElementById('reservationsEmpty');

    if (reservationsToRender.length === 0) {
        tbody.innerHTML = '';
        empty?.classList.remove('hidden');
        return;
    }

    empty?.classList.add('hidden');

    tbody.innerHTML = reservationsToRender.map(r => `
        <tr>
            <td>${r.date}</td>
            <td>${r.timeSlot}</td>
            <td>
                <span class="pharmacy-indicator" style="--pharmacy-color: ${getPharmacyColor(r.pharmacyId)}">
                    ${r.pharmacyName}
                </span>
            </td>
            <td>
                <strong>${r.clientName}</strong><br>
                <small>${r.clientContact}</small>
            </td>
            <td>
                <span class="admin-badge admin-badge--${getStatusClass(r.status)}">
                    ${getStatusLabel(r.status)}
                </span>
            </td>
            <td>
                <div class="admin-actions">
                    <button class="admin-action-btn admin-action-btn--danger" onclick="cancelReservation('${r.id}')" title="Cancelar">
                        <span class="material-symbols-outlined">cancel</span>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function getStatusClass(status) {
    const classes = {
        'scheduled': 'info',
        'checked-in': 'success',
        'completed': 'purple',
        'no-show': 'danger',
        'cancelled': 'muted'
    };
    return classes[status] || 'muted';
}

function getStatusLabel(status) {
    const labels = {
        'scheduled': 'Agendada',
        'checked-in': 'Check-in',
        'completed': 'Concluída',
        'no-show': 'Faltou',
        'cancelled': 'Cancelada'
    };
    return labels[status] || status;
}

window.cancelReservation = async function (reservationId) {
    const confirm = await showConfirm(
        'Tem certeza que deseja cancelar esta reserva? Esta ação não pode ser desfeita.',
        {
            title: 'Cancelar Reserva',
            confirmText: 'Sim, Cancelar',
            confirmStyle: 'danger'
        }
    );

    if (!confirm) return;

    showLoading('A cancelar reserva...');

    try {
        // ID format: date_blockId (e.g., 2026-01-30_10:00)
        let dateStr, blockId;

        // Handle ID formats with underscores
        const parts = reservationId.split('_');
        if (parts.length >= 2) {
            // Rejoin date parts if needed (though 2026-01-30 has no underscores inside)
            // But if blockId has underscore, we handle carefully
            dateStr = parts[0];
            blockId = parts.slice(1).join('_');
        } else {
            throw new Error('ID de reserva inválido');
        }

        // Get the schedule document
        const scheduleRef = doc(db, 'schedules', dateStr);
        const scheduleSnap = await getDoc(scheduleRef);

        if (!scheduleSnap.exists()) {
            throw new Error('Agendamento não encontrado');
        }

        const scheduleData = scheduleSnap.data();
        let appointments = scheduleData.appointments || {};

        // Convert Array to Object if needed (fixes "Unsupported field value: undefined" error)
        if (Array.isArray(appointments)) {
            appointments = { ...appointments };
        }

        // Remove the appointment by deleting the key
        if (appointments[blockId]) {
            delete appointments[blockId];

            // Delete the schedule doc if no appointments left?
            // Better to keep it but update it.
            await updateDoc(scheduleRef, {
                appointments: appointments
            });

            // Note: Ideally updateAvailabilityStatus should be called here
            // but it's in app.js. For now we accept availability might lag
            // or we could duplicate 'updateAvailabilityStatus' logic here.

            hideLoading();
            showToast('Reserva cancelada com sucesso', 'success');

            // Reload reservations
            loadReservations();
        } else {
            throw new Error('Reserva não encontrada no agendamento');
        }

    } catch (error) {
        console.error('Error cancelling reservation:', error);
        hideLoading();
        showToast('Erro ao cancelar reserva', 'error');
    }
};

// Listen for pharmacy select change

// ==========================================
// Custom Tooltip
// ==========================================

let tooltipEl = null;

function initTooltip() {
    if (document.getElementById('adminTooltip')) return;
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'adminTooltip';
    tooltipEl.className = 'admin-custom-tooltip';
    document.body.appendChild(tooltipEl);
}

function showTooltip(e, text) {
    if (!tooltipEl) initTooltip();
    tooltipEl.innerHTML = text;
    tooltipEl.classList.add('visible');

    // Position immediately
    updateTooltipPosition(e);
}

function hideTooltip() {
    tooltipEl?.classList.remove('visible');
}

function updateTooltipPosition(e) {
    if (!tooltipEl || !tooltipEl.classList.contains('visible')) return;

    const gap = 15;
    const rect = tooltipEl.getBoundingClientRect();
    let top = e.clientY - rect.height - gap;
    let left = e.clientX - (rect.width / 2);

    // Keep in viewport boundaries
    if (top < 10) top = e.clientY + gap; // If too close to top, show below
    if (left < 10) left = 10;
    if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;

    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
}

// ==========================================
// Admin User Management
// ==========================================

async function loadAdmins() {
    try {
        const adminsRef = collection(db, 'admins');
        const snapshot = await getDocs(adminsRef);

        admins = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderAdminsTable();
    } catch (error) {
        console.error('Error loading admins:', error);
    }
}

function renderAdminsTable() {
    const tbody = document.getElementById('adminsTableBody');
    const empty = document.getElementById('adminsEmpty');

    if (!tbody) return;

    if (admins.length === 0) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    tbody.innerHTML = admins.map(admin => `
        <tr>
            <td>
                <div class="admin-table-info">
                    <span class="admin-table-name">${admin.name || 'Sem nome'}</span>
                </div>
            </td>
            <td>${admin.email || '-'}</td>
            <td>${admin.loginAt ? new Date(admin.loginAt).toLocaleDateString() : 'Nunca'}</td>
            <td>
                <div class="admin-actions">
                    <button class="admin-action-btn" title="Editar" onclick="editAdminUser('${admin.id}')">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <!-- Prevent deleting yourself or the master admin fallback (by email) -->
                    ${admin.email !== 'alexandra@skinselflove.pt' ? `
                    <button class="admin-action-btn admin-action-btn--danger" title="Eliminar" onclick="deleteAdminUser('${admin.id}')">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

function openAdminUserModal(adminId = null) {
    const modal = document.getElementById('adminUserModal');
    const title = document.getElementById('adminUserModalTitle');

    // Reset fields
    document.getElementById('adminUserId').value = '';
    document.getElementById('adminUserNameInput').value = '';
    document.getElementById('adminUserEmailInput').value = '';
    document.getElementById('adminUserPasswordInput').value = '';

    if (adminId) {
        const admin = admins.find(a => a.id === adminId);
        if (admin) {
            title.textContent = 'Editar Administrador';
            document.getElementById('adminUserId').value = adminId;
            document.getElementById('adminUserNameInput').value = admin.name;
            document.getElementById('adminUserEmailInput').value = admin.email;
            document.getElementById('adminUserPasswordInput').placeholder = 'Deixe em branco para manter';
        }
    } else {
        title.textContent = 'Novo Administrador';
        document.getElementById('adminUserPasswordInput').placeholder = 'Senha forte';
    }

    modal?.classList.remove('hidden');
}

function closeAdminUserModal() {
    document.getElementById('adminUserModal')?.classList.add('hidden');
}

async function saveAdminUser() {
    const adminId = document.getElementById('adminUserId').value;
    const name = document.getElementById('adminUserNameInput').value.trim();
    const email = document.getElementById('adminUserEmailInput').value.trim();
    const password = document.getElementById('adminUserPasswordInput').value.trim();

    if (!name || !email) {
        showToast('Nome e Email são obrigatórios', 'warning');
        return;
    }

    // Password validation
    if (!adminId && !password) {
        showToast('Senha é obrigatória para novos administradores', 'warning');
        return;
    }

    if (password && password.length < 6) {
        showToast('A senha deve ter pelo menos 6 caracteres', 'warning');
        return;
    }

    showLoading('A guardar administrador...');

    try {
        const docId = adminId || `admin_${Date.now()}`;
        const data = {
            name,
            email,
            active: true,
            updatedAt: new Date().toISOString()
        };

        if (password) {
            data.password = password; // In production, hash this!
        }

        // If creating new, add createdAt
        if (!adminId) {
            data.createdAt = new Date().toISOString();
        }

        await setDoc(doc(db, 'admins', docId), data, { merge: true });

        closeAdminUserModal();
        await loadAdmins();
        showToast('Administrador guardado com sucesso', 'success');
    } catch (error) {
        console.error('Error saving admin:', error);
        showToast('Erro ao guardar administrador', 'error');
    } finally {
        hideLoading();
    }
}

// Bind to window for HTML inline calls
window.editAdminUser = openAdminUserModal;

window.deleteAdminUser = async function (adminId) {
    const confirm = await showConfirm(
        'Tem a certeza que deseja eliminar este administrador?',
        { confirmStyle: 'danger', confirmText: 'Eliminar' }
    );

    if (!confirm) return;

    try {
        await deleteDoc(doc(db, 'admins', adminId));
        await loadAdmins();
        showToast('Administrador eliminado', 'success');
    } catch (error) {
        console.error('Error deleting admin:', error);
        showToast('Erro ao eliminar administrador', 'error');
    }
};

// End of file
