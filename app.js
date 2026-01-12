/**
 * app.js - Main application orchestration
 * Boot, state management, and rendering
 */

import { initI18n, setLanguage, getLanguage, t, translatePage } from './i18n.js';
import {
    createInitialState,
    reflow,
    moveLunch,
    moveTechBreak,
    addTechBreak,
    removeTechBreak,
    bookAppointment,
    clearAppointment,
    getAppointmentById,
    generateId,
    durationToPx,
    moveAppointment,
    moveBlock,
    findBlockIndex,
    insertBlock,
    removeBlock,
    pixelToBlockPosition,
    timeToMinutes,
    minutesToTime,
    DAY_START,
    DAY_END,
    SLOT_DURATION,
    LUNCH_DURATION,
    TECH_BREAK_DURATION,
    BLOCK_TYPES
} from './scheduler.js';
import { initDrag, makeDraggable, cancelDrag } from './drag.js';
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// ==========================================
// Date Utilities
// ==========================================

/**
 * Format a date to YYYY-MM-DD using local timezone (avoids toISOString() drift)
 */
function formatLocalDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ==========================================
// State Management
// ==========================================

const THEME_KEY = 'skin-moments-theme';
const PHARMACY_KEY = 'ssl_pharmacyName';
const EXPERT_NAME_KEY = 'ssl_skinExpertName';
const EXPERT_AVATAR_KEY = 'ssl_skinExpertAvatar';
const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=face';

let state = createInitialState();
state.date = formatLocalDate(new Date());

state.date = formatLocalDate(new Date());

let unsubscribeSnapshot = null;
let flatpickrInstance = null;
let availabilityCache = {};

// ==========================================
// DOM Elements
// ==========================================

const elements = {
    scheduleBody: null,
    drawer: null,
    previewBar: null,
    mainContent: null,
    rescheduleSection: null,
    rescheduleList: null,
    themeToggle: null,
    themeIcon: null,
    langPT: null,
    langEN: null,
    addTechBreakBtn: null,
    printBtn: null,
    drawerClose: null,
    clearSlotBtn: null,
    saveSlotBtn: null,
    previewCancel: null,
    previewApply: null,
    clientName: null,
    clientContact: null,
    clientNotes: null,
    statusButtons: null,
    datePicker: null,
    dateDisplay: null,
    currentDate: null,
    previewMessage: null,
    pharmacyName: null,
    editPharmacyBtn: null,
    pharmacyEditMode: null,
    pharmacyInput: null,
    savePharmacyBtn: null,
    cancelPharmacyBtn: null,
    expertName: null,
    expertAvatarImg: null,
    editExpertBtn: null,
    expertModal: null,
    expertNameInput: null,
    modalAvatarImg: null,
    avatarUpload: null,
    uploadPhotoBtn: null,
    removePhotoBtn: null,
    saveExpertBtn: null,
    cancelExpertBtn: null
};

// ==========================================
// Initialization
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    cacheElements();
    await initI18n();
    translatePage();
    updateLanguageToggle();
    initTheme();
    initEditableFields();
    updateDateDisplay();

    initDrag({
        onDragEnd: handleDragEnd,
        onDragUpdate: handleDragUpdate
    });

    setupEventListeners();
    renderSchedule();
    loadScheduleFromFirebase();
});

function cacheElements() {
    elements.scheduleBody = document.getElementById('scheduleBody');
    elements.drawer = document.getElementById('drawer');
    elements.previewBar = document.getElementById('previewBar');
    elements.mainContent = document.getElementById('mainContent');
    elements.rescheduleSection = document.getElementById('rescheduleSection');
    elements.rescheduleList = document.getElementById('rescheduleList');
    elements.themeToggle = document.getElementById('themeToggle');
    elements.themeIcon = document.getElementById('themeIcon');
    elements.langPT = document.getElementById('langPT');
    elements.langEN = document.getElementById('langEN');
    elements.addTechBreakBtn = document.getElementById('addTechBreakBtn');
    elements.printBtn = document.getElementById('printBtn');
    elements.drawerClose = document.getElementById('drawerClose');
    elements.clearSlotBtn = document.getElementById('clearSlotBtn');
    elements.saveSlotBtn = document.getElementById('saveSlotBtn');
    elements.previewCancel = document.getElementById('previewCancel');
    elements.previewApply = document.getElementById('previewApply');
    elements.clientName = document.getElementById('clientName');
    elements.clientContact = document.getElementById('clientContact');
    elements.clientNotes = document.getElementById('clientNotes');
    elements.statusButtons = document.getElementById('statusButtons');
    elements.datePicker = document.getElementById('datePicker');
    elements.dateDisplay = document.getElementById('dateDisplay');
    elements.currentDate = document.getElementById('currentDate');
    elements.previewMessage = document.getElementById('previewMessage');
    elements.pharmacyName = document.getElementById('pharmacyName');
    elements.editPharmacyBtn = document.getElementById('editPharmacyBtn');
    elements.pharmacyEditMode = document.getElementById('pharmacyEditMode');
    elements.pharmacyInput = document.getElementById('pharmacyInput');
    elements.savePharmacyBtn = document.getElementById('savePharmacyBtn');
    elements.cancelPharmacyBtn = document.getElementById('cancelPharmacyBtn');
    elements.expertName = document.getElementById('expertName');
    elements.expertAvatarImg = document.getElementById('expertAvatarImg');
    elements.editExpertBtn = document.getElementById('editExpertBtn');
    elements.expertModal = document.getElementById('expertModal');
    elements.expertNameInput = document.getElementById('expertNameInput');
    elements.modalAvatarImg = document.getElementById('modalAvatarImg');
    elements.avatarUpload = document.getElementById('avatarUpload');
    elements.uploadPhotoBtn = document.getElementById('uploadPhotoBtn');
    elements.removePhotoBtn = document.getElementById('removePhotoBtn');
    elements.saveExpertBtn = document.getElementById('saveExpertBtn');
    elements.cancelExpertBtn = document.getElementById('cancelExpertBtn');
}

// ==========================================
// Firebase Integration
// ==========================================

async function loadScheduleFromFirebase() {
    try {
        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
        }

        const freshState = createInitialState();
        state.schedule = freshState.schedule;
        renderSchedule();

        const docId = state.date;
        const docRef = doc(db, "schedules", docId);

        const fetchWithTimeout = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 3000);
            getDoc(docRef)
                .then(result => { clearTimeout(timeout); resolve(result); })
                .catch(err => { clearTimeout(timeout); reject(err); });
        });

        try {
            const docSnap = await fetchWithTimeout;
            if (docSnap.exists()) {
                state.schedule = docSnap.data();
                renderSchedule();
            }
        } catch (fetchError) {
            console.warn("Initial fetch slow/failed:", fetchError);
        }

        unsubscribeSnapshot = onSnapshot(doc(db, "schedules", docId), (docSnapshot) => {
            if (docSnapshot.exists()) {
                state.schedule = docSnapshot.data();
                renderSchedule();
                updateAvailabilityStatus(docId);
            }
        });

    } catch (error) {
        console.error("Error getting document:", error);
    }
}

async function saveScheduleToFirebase() {
    try {
        const docId = state.date;
        await setDoc(doc(db, "schedules", docId), state.schedule);
        await updateAvailabilityStatus(docId);
    } catch (error) {
        console.error("Error saving schedule:", error);
    }
}

async function updateAvailabilityStatus(dateStr) {
    try {
        const { slots, appointments } = reflow(state.schedule);
        // With time-based appointments, 'slots' only contains EMPTY slots
        // 'appointments' contains booked appointments
        // Total potential slots = empty slots + booked appointments
        const emptySlotCount = slots.length;
        const bookedCount = appointments.filter(a => a.isBooked).length;
        const totalPotentialSlots = emptySlotCount + bookedCount;

        // Day is full only when there are no empty slots AND at least one booking
        const isFull = emptySlotCount === 0 && bookedCount > 0;

        const monthKey = dateStr.substring(0, 7);
        const monthRef = doc(db, "month_availability", monthKey);
        const monthSnap = await getDoc(monthRef);
        const monthData = monthSnap.exists() ? monthSnap.data() : {};

        if (isFull) {
            monthData[dateStr] = 'full';
        } else {
            delete monthData[dateStr];
        }

        await setDoc(monthRef, monthData);
        availabilityCache[monthKey] = monthData;

        if (flatpickrInstance) flatpickrInstance.redraw();
    } catch (error) {
        console.error("Error updating availability:", error);
    }
}

// ==========================================
// Theme Management
// ==========================================

function initTheme() {
    let theme = null;
    try { theme = localStorage.getItem(THEME_KEY); } catch (e) { }
    if (!theme) {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    setTheme(theme);
}

function setTheme(theme) {
    state.ui.theme = theme;
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        elements.themeIcon.textContent = 'light_mode';
    } else {
        document.documentElement.classList.remove('dark');
        elements.themeIcon.textContent = 'dark_mode';
    }
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { }
}

function toggleTheme() {
    setTheme(state.ui.theme === 'dark' ? 'light' : 'dark');
}

// ==========================================
// Language Management
// ==========================================

function updateLanguageToggle() {
    const lang = getLanguage();
    elements.langPT?.classList.toggle('active', lang === 'pt');
    elements.langEN?.classList.toggle('active', lang === 'en');
}

async function changeLanguage(lang) {
    await setLanguage(lang);
    translatePage();
    updateLanguageToggle();
    renderSchedule();
}

// ==========================================
// Editable Header Fields
// ==========================================

let tempAvatarDataUrl = null;

function initEditableFields() {
    try {
        const savedPharmacy = localStorage.getItem(PHARMACY_KEY);
        if (savedPharmacy && elements.pharmacyName) elements.pharmacyName.textContent = savedPharmacy;
    } catch (e) { }

    try {
        const savedExpertName = localStorage.getItem(EXPERT_NAME_KEY);
        if (savedExpertName && elements.expertName) elements.expertName.textContent = savedExpertName;
    } catch (e) { }

    try {
        const savedAvatar = localStorage.getItem(EXPERT_AVATAR_KEY);
        if (savedAvatar && elements.expertAvatarImg) elements.expertAvatarImg.src = savedAvatar;
        if (savedAvatar && elements.modalAvatarImg) elements.modalAvatarImg.src = savedAvatar;
    } catch (e) { }
}

function openPharmacyEdit() {
    if (elements.pharmacyInput) elements.pharmacyInput.value = elements.pharmacyName?.textContent || '';
    elements.pharmacyEditMode?.classList.remove('hidden');
    document.querySelector('.header__pharmacy-display')?.classList.add('hidden');
    elements.pharmacyInput?.focus();
}

function savePharmacy() {
    const newValue = elements.pharmacyInput?.value.trim();
    if (newValue && elements.pharmacyName) {
        elements.pharmacyName.textContent = newValue;
        try { localStorage.setItem(PHARMACY_KEY, newValue); } catch (e) { }
    }
    closePharmacyEdit();
}

function closePharmacyEdit() {
    elements.pharmacyEditMode?.classList.add('hidden');
    document.querySelector('.header__pharmacy-display')?.classList.remove('hidden');
}

function openExpertModal() {
    if (elements.expertNameInput) elements.expertNameInput.value = elements.expertName?.textContent || '';
    if (elements.modalAvatarImg) elements.modalAvatarImg.src = elements.expertAvatarImg?.src || DEFAULT_AVATAR;
    tempAvatarDataUrl = null;
    elements.expertModal?.classList.remove('hidden');
}

function closeExpertModal() {
    elements.expertModal?.classList.add('hidden');
    tempAvatarDataUrl = null;
}

function saveExpert() {
    const newName = elements.expertNameInput?.value.trim();
    if (newName && elements.expertName) {
        elements.expertName.textContent = newName;
        try { localStorage.setItem(EXPERT_NAME_KEY, newName); } catch (e) { }
    }
    if (tempAvatarDataUrl) {
        if (elements.expertAvatarImg) elements.expertAvatarImg.src = tempAvatarDataUrl;
        try { localStorage.setItem(EXPERT_AVATAR_KEY, tempAvatarDataUrl); } catch (e) { }
    }
    closeExpertModal();
}

function handleAvatarUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        if (e.target?.result && elements.modalAvatarImg) {
            elements.modalAvatarImg.src = e.target.result;
            tempAvatarDataUrl = e.target.result;
        }
    };
    reader.readAsDataURL(file);
}

function removeAvatar() {
    if (elements.modalAvatarImg) elements.modalAvatarImg.src = DEFAULT_AVATAR;
    tempAvatarDataUrl = DEFAULT_AVATAR;
    if (elements.expertAvatarImg) elements.expertAvatarImg.src = DEFAULT_AVATAR;
    try { localStorage.removeItem(EXPERT_AVATAR_KEY); } catch (e) { }
}

// ==========================================
// Date Management
// ==========================================

function updateDateDisplay() {
    const dateObj = new Date(state.date);
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    if (elements.currentDate) {
        elements.currentDate.textContent = `${weekdays[dateObj.getDay()]}, ${dateObj.getDate()} ${months[dateObj.getMonth()]}`;
    }

    const todayStr = formatLocalDate(new Date());
    const dateLabel = document.querySelector('.header__date-label');
    if (dateLabel) {
        dateLabel.textContent = state.date === todayStr ? t('today') : '';
        dateLabel.style.display = state.date === todayStr ? 'block' : 'none';
    }

    if (elements.datePicker) elements.datePicker.value = state.date;
}

function updateHeaderStatus(isFull) {
    const dateNav = document.querySelector('.header__date-nav');
    if (dateNav) dateNav.classList.toggle('header__date-nav--full', isFull);
}

async function changeDate(newDateStr) {
    if (state.date === newDateStr) return;
    state.date = newDateStr;
    updateDateDisplay();
    await loadScheduleFromFirebase();
}

function handlePrevDay() {
    const date = new Date(state.date);
    date.setDate(date.getDate() - 1);
    changeDate(formatLocalDate(date));
}

function handleNextDay() {
    const date = new Date(state.date);
    date.setDate(date.getDate() + 1);
    changeDate(formatLocalDate(date));
}

function initFlatpickr() {
    const datePickerEl = elements.datePicker;
    if (!datePickerEl) return;

    datePickerEl.style.cssText = 'position:absolute;opacity:0;pointer-events:none;';

    flatpickrInstance = flatpickr(datePickerEl, {
        dateFormat: 'Y-m-d',
        defaultDate: state.date,
        positionElement: elements.dateDisplay,
        onOpen: async (selectedDates, dateStr, instance) => {
            const monthKey = `${instance.currentYear}-${String(instance.currentMonth + 1).padStart(2, '0')}`;
            await fetchMonthAvailability(monthKey, true);
            instance.redraw();
        },
        onMonthChange: async (selectedDates, dateStr, instance) => {
            const monthKey = `${instance.currentYear}-${String(instance.currentMonth + 1).padStart(2, '0')}`;
            await fetchMonthAvailability(monthKey, true);
            instance.redraw();
        },
        onDayCreate: (dObj, dStr, fp, dayElem) => {
            const dateStr = formatLocalDate(dayElem.dateObj);
            const monthKey = dateStr.substring(0, 7);
            if (availabilityCache[monthKey]?.[dateStr] === 'full') {
                dayElem.classList.add('day-full');
            }
        },
        onChange: (selectedDates, dateStr) => { if (dateStr) changeDate(dateStr); }
    });

    elements.dateDisplay?.addEventListener('click', () => flatpickrInstance?.open());
}

async function fetchMonthAvailability(monthKey, forceRefresh = false) {
    if (!forceRefresh && availabilityCache[monthKey]) return availabilityCache[monthKey];
    try {
        const monthRef = doc(db, "month_availability", monthKey);
        const monthSnap = await getDoc(monthRef);
        availabilityCache[monthKey] = monthSnap.exists() ? monthSnap.data() : {};
        return availabilityCache[monthKey];
    } catch (error) {
        return availabilityCache[monthKey] || {};
    }
}

// ==========================================
// Rendering
// ==========================================

function renderSchedule() {
    const { scheduleItems, slots, appointments, needsReschedule } = reflow(state.schedule);

    // Store computed values (don't overwrite schedule.appointments)
    state.computed.slots = slots;
    state.computed.appointments = appointments;
    state.needsReschedule = needsReschedule;

    elements.scheduleBody.innerHTML = '';

    scheduleItems.forEach((item) => {
        const row = createScheduleRow(item, appointments);
        elements.scheduleBody.appendChild(row);
    });

    // Day is full when no empty slots AND at least one booking
    const emptySlotCount = slots.length;
    const bookedCount = appointments.length;
    const isFull = emptySlotCount === 0 && bookedCount > 0;
    updateHeaderStatus(isFull);

    renderRescheduleSection();
    attachDragHandlers();
}

function createScheduleRow(item, appointments) {
    const row = document.createElement('div');
    row.className = 'schedule__row';
    row.setAttribute('data-item-id', item.id);
    row.setAttribute('data-item-type', item.type);

    if (item.type === 'lunch') row.classList.add('schedule__row--lunch');
    else if (item.type === 'techBreak') row.classList.add('schedule__row--techbreak');
    else if (item.type === 'bookedAppointment') row.classList.add('schedule__row--booked');

    const timeCol = document.createElement('div');
    timeCol.className = 'schedule__time';
    timeCol.innerHTML = `
    <span class="schedule__time-start">${item.start}</span>
    <span class="schedule__time-end">${item.end}</span>
  `;

    const contentCol = document.createElement('div');
    contentCol.className = 'schedule__content';

    if (item.type === 'lunch') {
        contentCol.innerHTML = createLunchBlock();
    } else if (item.type === 'techBreak') {
        contentCol.innerHTML = createTechBreakBlock(item.id);
    } else if (item.type === 'bookedAppointment' && item.data) {
        // Booked appointment (time-based block)
        contentCol.innerHTML = createBookedSlot(item.data, item.start);
    } else {
        // Empty slot - pass blockId for booking
        contentCol.innerHTML = createAvailableSlot(item.start, item.id);
    }

    row.appendChild(timeCol);
    row.appendChild(contentCol);
    return row;
}

function createLunchBlock() {
    return `
    <div class="lunch-block" id="lunchBlock">
      <span class="lunch-block__title" data-i18n="lunch">${t('lunch')}</span>
      <span class="lunch-block__duration" data-i18n="lunchDuration">${t('lunchDuration')}</span>
      <span class="lunch-block__drag-handle material-symbols-outlined">drag_indicator</span>
    </div>
  `;
}

function createTechBreakBlock(breakId) {
    return `
    <div class="techbreak-block" data-break-id="${breakId}">
      <span class="techbreak-block__icon material-symbols-outlined">coffee</span>
      <span class="techbreak-block__text">${t('techBreak')} (${t('techBreakShort')})</span>
      <button class="techbreak-block__delete-btn no-print" data-break-id="${breakId}" title="${t('delete')}">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
  `;
}

function createAvailableSlot(startTime, blockId) {
    return `
    <div class="slot--available" data-slot-start="${startTime}" data-block-id="${blockId}">
      <span class="slot--available__text">
        <span class="material-symbols-outlined">add_circle</span>
        ${t('available')}
      </span>
    </div>
  `;
}

function createBookedSlot(apt, startTime) {
    const statusClass = `status--${apt.status}`;
    const statusLabel = t(apt.status === 'checked-in' ? 'checkedIn' : apt.status === 'no-show' ? 'noShow' : apt.status);
    const contactIcon = apt.contact.includes('@') ? 'mail' : 'call';
    const noteHtml = apt.notes ? `<span class="slot__note">${apt.notes}</span>` : '';
    const cancelledNote = apt.status === 'cancelled' ? `<span class="slot__cancelled-note">${t('cancelledByClient')}</span>` : '';

    return `
    <div class="slot--booked ${statusClass}" data-appointment-id="${apt.id}" data-start-time="${startTime}">
      <div class="slot__drag-handle no-print">
        <span class="material-symbols-outlined">drag_indicator</span>
      </div>
      <div class="slot__client-info">
        <span class="slot__client-name">${apt.name}</span>
        <span class="slot__client-contact">
          <span class="material-symbols-outlined">${contactIcon}</span>
          ${apt.contact}
        </span>
        ${cancelledNote}
      </div>
      ${noteHtml}
      <div class="slot__actions">
        <span class="slot__status slot__status--${apt.status}">${statusLabel}</span>
        <button class="slot__clear-btn no-print" data-appointment-id="${apt.id}" title="${t('clearSlot')}">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>
  `;
}

function renderRescheduleSection() {
    if (state.needsReschedule.length === 0) {
        elements.rescheduleSection?.classList.remove('visible');
        return;
    }
    elements.rescheduleSection?.classList.add('visible');
    if (elements.rescheduleList) {
        elements.rescheduleList.innerHTML = state.needsReschedule.map(apt => `
      <li class="reschedule-section__item">
        <span class="reschedule-section__client">${apt.name}</span>
        <span class="reschedule-section__time">${apt.contact}</span>
      </li>
    `).join('');
    }
}

// ==========================================
// Drag Handling & Preview
// ==========================================

function attachDragHandlers() {
    // Get reflowed schedule to know block positions and times
    const { scheduleItems } = reflow(state.schedule);

    // Attach drag handler to lunch block
    const lunchBlock = document.getElementById('lunchBlock');
    if (lunchBlock) {
        const lunchItem = scheduleItems.find(item => item.type === 'lunch');
        if (lunchItem) {
            makeDraggable(lunchBlock, 'lunch', lunchItem.start, 'lunch', lunchItem.blockIndex);
        }
    }

    // Attach drag handlers to tech breaks
    document.querySelectorAll('.techbreak-block').forEach(block => {
        const breakId = block.getAttribute('data-break-id');
        const breakItem = scheduleItems.find(item => item.id === breakId && item.type === 'techBreak');
        if (breakItem) {
            makeDraggable(block, 'techBreak', breakItem.start, breakId, breakItem.blockIndex);
        }
    });

    // Attach drag handlers to booked appointments
    document.querySelectorAll('.slot--booked').forEach(slot => {
        const appointmentId = slot.dataset.appointmentId;
        const aptItem = scheduleItems.find(item => item.id === appointmentId);
        if (aptItem) {
            makeDraggable(slot, 'appointment', aptItem.start, appointmentId, aptItem.blockIndex);
        }
    });
}

function handleDragEnd(dragResult) {
    let scheduleChanged = false;

    // dragResult now contains: type, blockId, fromIndex, toIndex (position-based)
    if (dragResult.toIndex !== undefined && dragResult.fromIndex !== undefined) {
        // Position-based move
        state.schedule = moveBlock(state.schedule, dragResult.fromIndex, dragResult.toIndex);
        scheduleChanged = true;
    } else if (dragResult.type === 'lunch') {
        // Legacy time-based (fallback)
        state.schedule = moveLunch(state.schedule, dragResult.toIndex || 0);
        scheduleChanged = true;
    } else if (dragResult.type === 'techBreak') {
        state.schedule = moveTechBreak(state.schedule, dragResult.breakId, dragResult.toIndex || 0);
        scheduleChanged = true;
    }

    if (scheduleChanged) {
        renderSchedule();
        saveScheduleToFirebase();
    }
}

function handleDragUpdate(dragData) {
    // Visual feedback during drag (optional)
}
// applyPreview and cancelPreview removed as confirmation is no longer required

// ==========================================
// Drawer (Edit Panel)
// ==========================================

function openDrawer(blockId, startTime) {
    state.ui.selectedSlotId = blockId; // Block ID for new or existing
    state.ui.selectedTime = startTime;
    state.ui.drawerOpen = true;

    const apt = blockId ? getAppointmentById(state.schedule, blockId) : null;

    if (elements.clientName) elements.clientName.value = apt?.name || '';
    if (elements.clientContact) elements.clientContact.value = apt?.contact || '';
    if (elements.clientNotes) elements.clientNotes.value = apt?.notes || '';

    const status = apt?.status || 'scheduled';
    elements.statusButtons?.querySelectorAll('.status-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });

    elements.drawer?.classList.add('open');
    elements.mainContent?.classList.add('drawer-open');
}

function closeDrawer() {
    state.ui.selectedSlotId = null;
    state.ui.selectedTime = null;
    state.ui.drawerOpen = false;
    elements.drawer?.classList.remove('open');
    elements.mainContent?.classList.remove('drawer-open');
}

function saveSlot() {
    const startTime = state.ui.selectedTime;
    const blockId = state.ui.selectedSlotId;
    if (!startTime || !blockId) return;

    const name = elements.clientName?.value.trim() || '';
    const contact = elements.clientContact?.value.trim() || '';
    const notes = elements.clientNotes?.value.trim() || '';
    const activeStatusBtn = elements.statusButtons?.querySelector('.status-btn.active');
    const status = activeStatusBtn?.dataset.status || 'scheduled';

    if (!name && blockId) {
        // Clear existing appointment if name is empty
        state.schedule = clearAppointment(state.schedule, blockId);
    } else if (name && blockId) {
        // Book or update appointment using blockId
        state.schedule = bookAppointment(state.schedule, blockId, { name, contact, notes, status });
    }

    closeDrawer();
    renderSchedule();
    saveScheduleToFirebase();
}

function clearSlot() {
    const appointmentId = state.ui.selectedSlotId;
    if (appointmentId) {
        state.schedule = clearAppointment(state.schedule, appointmentId);
        closeDrawer();
        renderSchedule();
        saveScheduleToFirebase();
    }
}

// ==========================================
// Technical Break Management
// ==========================================

function handleAddTechBreak() {
    // With the new ordered block model, insert a tech break at position 1
    // (after the first slot, effectively at the beginning of the day)
    state.schedule = addTechBreak(state.schedule, 1);
    renderSchedule();
    saveScheduleToFirebase();
}

function handleDeleteTechBreak(breakId) {
    state.schedule = removeTechBreak(state.schedule, breakId);
    renderSchedule();
    saveScheduleToFirebase();
}

function handleClearAppointment(appointmentId) {
    state.schedule = clearAppointment(state.schedule, appointmentId);
    renderSchedule();
    saveScheduleToFirebase();
}

// ==========================================
// Event Listeners
// ==========================================

function setupEventListeners() {
    document.getElementById('prevDayBtn')?.addEventListener('click', handlePrevDay);
    document.getElementById('nextDayBtn')?.addEventListener('click', handleNextDay);

    initFlatpickr();

    elements.themeToggle?.addEventListener('click', toggleTheme);
    elements.langPT?.addEventListener('click', () => changeLanguage('pt'));
    elements.langEN?.addEventListener('click', () => changeLanguage('en'));
    elements.printBtn?.addEventListener('click', () => window.print());
    elements.addTechBreakBtn?.addEventListener('click', handleAddTechBreak);
    elements.drawerClose?.addEventListener('click', closeDrawer);
    elements.clearSlotBtn?.addEventListener('click', closeDrawer); // Fixed: Cancel should close, not delete
    elements.saveSlotBtn?.addEventListener('click', saveSlot);

    elements.statusButtons?.addEventListener('click', (e) => {
        const btn = e.target.closest('.status-btn');
        if (btn) {
            elements.statusButtons.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
    });

    elements.scheduleBody?.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.techbreak-block__delete-btn');
        if (deleteBtn) {
            e.stopPropagation();
            const breakId = deleteBtn.dataset.breakId;
            if (breakId) handleDeleteTechBreak(breakId);
            return;
        }

        const clearBtn = e.target.closest('.slot__clear-btn');
        if (clearBtn) {
            e.stopPropagation();
            const appointmentId = clearBtn.dataset.appointmentId;
            if (appointmentId) handleClearAppointment(appointmentId);
            return;
        }

        // Click on booked appointment to edit
        const bookedSlot = e.target.closest('.slot--booked');
        if (bookedSlot) {
            const appointmentId = bookedSlot.dataset.appointmentId;
            const startTime = bookedSlot.dataset.startTime;
            openDrawer(appointmentId, startTime);
            return;
        }

        // Click on available slot to add new
        const availableSlot = e.target.closest('.slot--available');
        if (availableSlot) {
            const blockId = availableSlot.dataset.blockId;
            const startTime = availableSlot.dataset.slotStart;
            openDrawer(blockId, startTime);
            return;
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (state.ui.drawerOpen) closeDrawer();
            if (!elements.expertModal?.classList.contains('hidden')) closeExpertModal();
            if (!elements.pharmacyEditMode?.classList.contains('hidden')) closePharmacyEdit();
        }
    });

    elements.editPharmacyBtn?.addEventListener('click', openPharmacyEdit);
    elements.savePharmacyBtn?.addEventListener('click', savePharmacy);
    elements.cancelPharmacyBtn?.addEventListener('click', closePharmacyEdit);
    elements.pharmacyInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') savePharmacy(); });
    elements.editExpertBtn?.addEventListener('click', openExpertModal);
    elements.saveExpertBtn?.addEventListener('click', saveExpert);
    elements.cancelExpertBtn?.addEventListener('click', closeExpertModal);
    elements.uploadPhotoBtn?.addEventListener('click', () => elements.avatarUpload?.click());
    elements.avatarUpload?.addEventListener('change', handleAvatarUpload);
    elements.removePhotoBtn?.addEventListener('click', removeAvatar);
    elements.expertModal?.addEventListener('click', (e) => { if (e.target === elements.expertModal) closeExpertModal(); });
}

// ==========================================
// Exports for debugging
// ==========================================

window.SkinMoments = {
    getState: () => state
};
