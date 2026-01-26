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
let lockedDates = new Set();
let dateAssignmentCalendar = null;
let bookingsByDate = {}; // { [date]: { total, booked } }
const MAX_BOOKABLE_SLOTS = 11; // 11 slots per day (with lunch + 2 tech breaks)

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
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.getElementById('addPharmacyBtn')?.addEventListener('click', () => openPharmacyModal());
    document.getElementById('addFirstPharmacyBtn')?.addEventListener('click', () => openPharmacyModal());
    document.getElementById('assignDatesBtn')?.addEventListener('click', assignDates);
    document.getElementById('clearSelectedDatesBtn')?.addEventListener('click', clearSelectedDates);
    document.getElementById('assignPharmacySelect')?.addEventListener('change', () => {
        filterSelectedDatesForPharmacy();
        dateAssignmentCalendar?.redraw();
        updateSelectedDatesList();
        updateAssignButton();
    });

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
    const icon = document.getElementById('themeIcon');
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        if (icon) icon.textContent = 'light_mode';
    } else {
        document.documentElement.classList.remove('dark');
        if (icon) icon.textContent = 'dark_mode';
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
        if (tbody) tbody.innerHTML = '';
        empty?.classList.remove('hidden');
        return;
    }

    empty?.classList.add('hidden');

    if (tbody) {
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
            if (title) title.textContent = 'Editar Farmácia';
            document.getElementById('pharmacyId').value = pharmacyId;
            document.getElementById('pharmacyNameInput').value = pharmacy.name;
            document.getElementById('pharmacyContactInput').value = pharmacy.contact || '';
            document.getElementById('pharmacyPinInput').value = pharmacy.pin;
            document.getElementById('pharmacyActiveInput').checked = pharmacy.active;
        }
    } else {
        if (title) title.textContent = 'Nova Farmácia';
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
            const updates = [];
            // Date Assignments
            const assignmentsRef = collection(db, 'dateAssignments');
            const q = query(assignmentsRef, where('pharmacyId', '==', docId));
            const snapshot = await getDocs(q);
            snapshot.docs.forEach(d => {
                updates.push(updateDoc(d.ref, { pharmacyName: name }));
            });

            // Schedules
            const schedulesRef = collection(db, 'schedules');
            const q2 = query(schedulesRef, where('pharmacyId', '==', docId));
            const snap2 = await getDocs(q2);
            snap2.docs.forEach(d => {
                updates.push(updateDoc(d.ref, { pharmacyName: name }));
            });

            if (updates.length > 0) await Promise.all(updates);
        }

        closePharmacyModal();
        await loadPharmacies();
        await loadDateAssignments();
        showToast('Farmácia guardada', 'success');
    } catch (error) {
        console.error('Error saving pharmacy:', error);
        showToast('Erro ao guardar farmácia', 'error');
    }
}

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
            const pharmacyId = document.getElementById('assignPharmacySelect')?.value;

            // Reset any stale classes/attrs from previous renders
            dayElem.classList.remove('date-blocked', 'date-locked', 'date-locked-full', 'date-locked-other');
            dayElem.removeAttribute('data-pharmacy');
            dayElem.removeAttribute('title');
            dayElem.style.removeProperty('--pharmacy-color');

            if (assignment) {
                dayElem.classList.add('date-blocked');
                dayElem.setAttribute('data-pharmacy', assignment.pharmacyName);
                dayElem.removeAttribute('title');

                const bookingInfo = bookingsByDate[dateStr] || { total: MAX_BOOKABLE_SLOTS, booked: 0 };
                const tooltipHtml = `Atribuído: <strong>${assignment.pharmacyName}</strong><br/>` +
                    `Reservas: <strong>${bookingInfo.booked}/${bookingInfo.total || '0'}</strong>`;

                dayElem.addEventListener('mouseenter', (e) => {
                    showTooltip(e, tooltipHtml);
                });
                dayElem.addEventListener('mouseleave', () => hideTooltip());
                dayElem.addEventListener('mousemove', (e) => updateTooltipPosition(e));

                dayElem.style.setProperty('--pharmacy-color', getPharmacyColor(assignment.pharmacyId));
            }

            // Only show locked styling when the date is assigned AND has bookings
            if (lockedDates.has(dateStr) && assignment) {
                const info = bookingsByDate[dateStr] || { total: MAX_BOOKABLE_SLOTS, booked: 0 };
                const isFullyBooked = info.total > 0 && info.booked >= info.total;

                dayElem.classList.add(isFullyBooked ? 'date-locked-full' : 'date-locked');

                // ONLY prevent interaction if assigned to ANOTHER pharmacy
                if (assignment.pharmacyId !== pharmacyId) {
                    dayElem.classList.add('date-locked-other');
                    dayElem.setAttribute('title', 'Bloqueada por outra farmácia');
                } else {
                    dayElem.setAttribute('title', isFullyBooked ? 'Dia totalmente reservado' : 'Esta data tem marcações');
                }
            }
        },
        onChange: () => {
            filterSelectedDatesForPharmacy();
            updateSelectedDatesList();
            updateAssignButton();
        }
    });
}

function getPharmacyColor(pharmacyId) {
    const colors = ['#7B9E89', '#5B8FB9', '#B97B5B', '#9B7BB9', '#B9A05B', '#5BB9A0', '#B95B8F'];
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

    if (!list) return;

    if (dates.length === 0) {
        list.innerHTML = '<span class="selected-dates-empty">Clique no calendário para selecionar datas</span>';
        return;
    }

    list.innerHTML = dates.sort((a, b) => a - b).map(d => {
        const dateStr = formatLocalDate(d);
        return `<span class="selected-date-tag">${dateStr}</span>`;
    }).join('');
}

function updateAssignButton() {
    const btn = document.getElementById('assignDatesBtn');
    const pharmacySelect = document.getElementById('assignPharmacySelect');
    const dates = dateAssignmentCalendar?.selectedDates || [];

    if (btn) {
        btn.disabled = dates.length === 0 || !pharmacySelect?.value;
    }
}

function clearSelectedDates() {
    dateAssignmentCalendar?.clear();
    updateSelectedDatesList();
    updateAssignButton();
}

function filterSelectedDatesForPharmacy() {
    if (!dateAssignmentCalendar) return;

    const pharmacyId = document.getElementById('assignPharmacySelect')?.value;
    const selected = dateAssignmentCalendar.selectedDates || [];

    if (selected.length === 0) return;

    const allowed = [];
    let blockedCount = 0;

    selected.forEach(d => {
        const ds = formatLocalDate(d);
        const assignment = dateAssignments[ds];

        if (!assignment || assignment.pharmacyId === pharmacyId) {
            allowed.push(d);
            return;
        }

        if (!lockedDates.has(ds)) {
            allowed.push(d);
        } else {
            blockedCount++;
        }
    });

    if (blockedCount > 0) {
        dateAssignmentCalendar.clear();
        if (allowed.length > 0) {
            dateAssignmentCalendar.setDate(allowed, true);
        }
        showToast(`${blockedCount} data(s) bloqueada(s) por outra farmácia`, 'warning');
    }
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
        try { await Promise.all(updates); } catch (err) { }
    }
}

function renderAssignedDatesGrid() {
    const grid = document.getElementById('assignedDatesGrid');
    const empty = document.getElementById('assignedDatesEmpty');
    const entries = Object.entries(dateAssignments);

    if (!grid) return;

    if (entries.length === 0) {
        grid.innerHTML = '';
        empty?.classList.remove('hidden');
        return;
    }

    empty?.classList.add('hidden');

    const byPharmacy = {};
    entries.forEach(([date, data]) => {
        if (!byPharmacy[data.pharmacyId]) {
            byPharmacy[data.pharmacyId] = { name: data.pharmacyName, dates: [] };
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

        dateAssignmentCalendar?.clear();
        document.getElementById('assignPharmacySelect').selectedIndex = 0;
        updateSelectedDatesList();
        updateAssignButton();

        await loadDateAssignments();
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
        await loadDateAssignments();
        showToast('Atribuição removida', 'success');
    } catch (error) {
        console.error('Error removing assignment:', error);
        showToast('Erro ao remover atribuição', 'error');
    }
};

// ==========================================
// Reservations
// ==========================================

async function loadReservations() {
    try {
        const schedulesRef = collection(db, 'schedules');
        const snapshot = await getDocs(schedulesRef);

        reservations = [];
        lockedDates.clear();
        bookingsByDate = {}; // map date -> { total, booked }

        snapshot.docs.forEach(docSnap => {
            const dateStr = docSnap.id;
            const data = docSnap.data();
            let dayHasBookings = false;
            let bookedCount = 0;
            let totalCount = MAX_BOOKABLE_SLOTS;

            if (data.appointments) {
                Object.entries(data.appointments).forEach(([blockId, apt]) => {
                    if (!apt) return;
                    if (apt.isBooked) {
                        dayHasBookings = true;
                        bookedCount += 1;
                    }

                    let pharmacyId = apt.pharmacyId || data.pharmacyId || null;
                    let pharmacyName = apt.pharmacyName || data.pharmacyName || null;

                    if (!pharmacyName && dateAssignments[dateStr]) {
                        pharmacyId = dateAssignments[dateStr].pharmacyId;
                        pharmacyName = dateAssignments[dateStr].pharmacyName;
                    }

                    reservations.push({
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

            bookingsByDate[dateStr] = { total: totalCount, booked: bookedCount };
            if (dayHasBookings) lockedDates.add(dateStr);
        });

        reservations.sort((a, b) => b.date.localeCompare(a.date));
        renderReservationsTable();
        setupReservationFilters();
        dateAssignmentCalendar?.redraw();
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

    let filtered = [...reservations];
    if (pharmacyFilter) filtered = filtered.filter(r => r.pharmacyId === pharmacyFilter);
    if (dateFilter) filtered = filtered.filter(r => r.date === dateFilter);

    renderReservationsTable(filtered);
}

function renderReservationsTable(listToRender = reservations) {
    const tbody = document.getElementById('reservationsTableBody');
    const empty = document.getElementById('reservationsEmpty');

    if (!tbody) return;

    if (listToRender.length === 0) {
        tbody.innerHTML = '';
        empty?.classList.remove('hidden');
        return;
    }

    empty?.classList.add('hidden');

    tbody.innerHTML = listToRender.map(r => `
        <tr>
            <td>${r.date}</td>
            <td>${r.timeSlot}</td>
            <td>
                <span class="pharmacy-indicator" style="--pharmacy-color: ${getPharmacyColor(r.pharmacyId)}">
                    ${r.pharmacyName}
                </span>
            </td>
            <td><strong>${r.clientName}</strong><br><small>${r.clientContact}</small></td>
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
    const classes = { 'scheduled': 'info', 'checked-in': 'success', 'completed': 'purple', 'no-show': 'danger', 'cancelled': 'muted' };
    return classes[status] || 'muted';
}

function getStatusLabel(status) {
    const labels = { 'scheduled': 'Agendada', 'checked-in': 'Check-in', 'completed': 'Concluída', 'no-show': 'Faltou', 'cancelled': 'Cancelada' };
    return labels[status] || status;
}

window.cancelReservation = async function (reservationId) {
    const confirm = await showConfirm(
        'Tem certeza que deseja cancelar esta reserva? Esta ação não pode ser desfeita.',
        { title: 'Cancelar Reserva', confirmText: 'Sim, Cancelar', confirmStyle: 'danger' }
    );

    if (!confirm) return;

    showLoading('A cancelar reserva...');

    try {
        const parts = reservationId.split('_');
        if (parts.length < 2) throw new Error('ID inválido');

        const dateStr = parts[0];
        const blockId = parts.slice(1).join('_');

        const scheduleRef = doc(db, 'schedules', dateStr);
        const scheduleSnap = await getDoc(scheduleRef);

        if (scheduleSnap.exists()) {
            const data = scheduleSnap.data();
            let appointments = data.appointments || {};
            if (Array.isArray(appointments)) appointments = { ...appointments };

            if (appointments[blockId]) {
                delete appointments[blockId];
                await updateDoc(scheduleRef, { appointments });
                hideLoading();
                showToast('Reserva cancelada', 'success');
                await loadReservations();
            }
        }
    } catch (error) {
        console.error(error);
        hideLoading();
        showToast('Erro ao cancelar', 'error');
    }
};

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
    if (top < 10) top = e.clientY + gap;
    if (left < 10) left = 10;
    if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
}

// ==========================================
// Admin User Management
// ==========================================

let adminUsers = [];
let pendingInvites = [];

async function loadAdmins() {
    try {
        const usersRef = collection(db, 'users');
        const qUsers = query(usersRef, where('role', 'in', ['admin', 'owner']));
        const snapUsers = await getDocs(qUsers);
        adminUsers = snapUsers.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const invitesRef = collection(db, 'invites');
        const snapInvites = await getDocs(invitesRef);
        pendingInvites = snapInvites.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        renderAdminsTable();
    } catch (error) {
        console.error('Error loading admin users:', error);
    }
}

function renderAdminsTable() {
    const tbody = document.getElementById('adminsTableBody');
    const empty = document.getElementById('adminsEmpty');

    if (!tbody) return;

    if (adminUsers.length === 0 && pendingInvites.length === 0) {
        tbody.innerHTML = '';
        empty?.classList.remove('hidden');
        return;
    }

    empty?.classList.add('hidden');

    const userRows = adminUsers.map(u => `
        <tr>
            <td><span class="admin-table-name">${u.name || 'Sem nome'}</span></td>
            <td>${u.email}</td>
            <td><span class="admin-badge ${u.role === 'owner' ? 'admin-badge--purple' : 'admin-badge--success'}">${u.role === 'owner' ? 'Owner' : 'Ativo'}</span></td>
            <td><div class="admin-actions">${u.role !== 'owner' ? `<button class="admin-action-btn admin-action-btn--danger" onclick="deleteAdminUser('${u.id}', 'user')"><span class="material-symbols-outlined">person_remove</span></button>` : ''}</div></td>
        </tr>
    `).join('');

    const inviteRows = pendingInvites.map(i => `
        <tr>
            <td><span class="admin-table-name">${i.name}</span> <small>(Convite)</small></td>
            <td>${i.email}</td>
            <td><span class="admin-badge admin-badge--info">Pendente</span></td>
            <td><div class="admin-actions"><button class="admin-action-btn admin-action-btn--danger" onclick="deleteAdminUser('${i.id}', 'invite')"><span class="material-symbols-outlined">close</span></button></div></td>
        </tr>
    `).join('');

    tbody.innerHTML = userRows + inviteRows;
}

function openAdminUserModal() {
    const modal = document.getElementById('adminUserModal');
    document.getElementById('adminUserId').value = '';
    document.getElementById('adminUserNameInput').value = '';
    document.getElementById('adminUserEmailInput').value = '';
    modal?.classList.remove('hidden');
}

function closeAdminUserModal() {
    document.getElementById('adminUserModal')?.classList.add('hidden');
}

async function saveAdminUser() {
    const name = document.getElementById('adminUserNameInput').value.trim();
    const email = document.getElementById('adminUserEmailInput').value.trim();
    if (!name || !email) return showToast('Preencha os campos', 'warning');

    showLoading('A criar convite...');
    try {
        const session = getSession();
        await setDoc(doc(db, 'invites', email), { name, email, role: 'admin', invitedBy: session.uid || 'admin', createdAt: new Date().toISOString() });
        closeAdminUserModal();
        await loadAdmins();
        showToast('Convite enviado', 'success');
    } catch (e) {
        showToast('Erro ao criar convite', 'error');
    } finally {
        hideLoading();
    }
}

window.deleteAdminUser = async function (id, type) {
    const confirm = await showConfirm('Remover este acesso?', { confirmStyle: 'danger' });
    if (!confirm) return;
    try {
        if (type === 'user') await deleteDoc(doc(db, 'users', id));
        else await deleteDoc(doc(db, 'invites', id));
        await loadAdmins();
        showToast('Removido com sucesso', 'success');
    } catch (e) {
        showToast('Erro ao remover', 'error');
    }
};
