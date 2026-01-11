/**
 * drag.js - Drag interactions with preview/apply mechanism
 * Uses Pointer Events for touch/mouse support
 */

import {
    timeToMinutes,
    minutesToTime,
    snapToGrid,
    durationToPx,
    PX_PER_MINUTE,
    DAY_START,
    DAY_END,
    LUNCH_DURATION,
    TECH_BREAK_DURATION,
    SLOT_DURATION
} from './scheduler.js';

let isDragging = false;
let dragTarget = null;
let dragType = null; // 'lunch' or 'techBreak'
let dragBreakId = null;
let startY = 0;
let startTime = null;
let currentTime = null;
let onDragEnd = null;
let onDragMove = null;

/**
 * Initialize drag handlers
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.onPreview - Called when drag ends with proposed new time
 * @param {Function} callbacks.onDragUpdate - Called during drag with current position
 */
export function initDrag(callbacks) {
    onDragEnd = callbacks.onPreview || (() => { });
    onDragMove = callbacks.onDragUpdate || (() => { });
}

/**
 * Make an element draggable
 * @param {HTMLElement} element - Element to make draggable
 * @param {string} type - 'lunch' or 'techBreak'
 * @param {string} startTimeStr - Current start time "HH:MM"
 * @param {string} [breakId] - Break ID for tech breaks
 */
export function makeDraggable(element, type, startTimeStr, breakId = null) {
    element.style.cursor = 'grab';
    element.setAttribute('data-draggable', 'true');
    element.setAttribute('data-drag-type', type);
    element.setAttribute('data-start-time', startTimeStr);
    if (breakId) {
        element.setAttribute('data-break-id', breakId);
    }

    element.addEventListener('pointerdown', handlePointerDown);
}

/**
 * Remove draggable behavior
 * @param {HTMLElement} element - Element to remove dragging from
 */
export function removeDraggable(element) {
    element.style.cursor = '';
    element.removeAttribute('data-draggable');
    element.removeAttribute('data-drag-type');
    element.removeAttribute('data-start-time');
    element.removeAttribute('data-break-id');
    element.removeEventListener('pointerdown', handlePointerDown);
}

/**
 * Handle pointer down event (start drag)
 * @param {PointerEvent} e - Pointer event
 */
function handlePointerDown(e) {
    // Only handle primary button (left click / touch)
    if (e.button !== 0) return;

    // Don't intercept clicks on buttons (delete, clear, etc.)
    // This allows button click events to propagate normally
    if (e.target.closest('button') || e.target.closest('.techbreak-block__delete-btn') || e.target.closest('.slot__clear-btn')) {
        return;
    }

    e.preventDefault();

    dragTarget = e.currentTarget;
    dragType = dragTarget.getAttribute('data-drag-type');
    dragBreakId = dragTarget.getAttribute('data-break-id');
    startTime = dragTarget.getAttribute('data-start-time');
    currentTime = startTime;
    startY = e.clientY;
    isDragging = true;

    // Visual feedback
    dragTarget.style.cursor = 'grabbing';
    dragTarget.style.opacity = '0.8';
    dragTarget.style.zIndex = '100';

    // Capture pointer
    dragTarget.setPointerCapture(e.pointerId);

    // Add move and up listeners
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
}

/**
 * Handle pointer move event (during drag)
 * @param {PointerEvent} e - Pointer event
 */
function handlePointerMove(e) {
    if (!isDragging) return;

    const deltaY = e.clientY - startY;
    const deltaMinutes = Math.round(deltaY / PX_PER_MINUTE);

    // Calculate new time
    const startMinutes = timeToMinutes(startTime);
    let newMinutes = startMinutes + deltaMinutes;

    // Snap to grid
    newMinutes = snapToGrid(newMinutes);

    // Get duration based on type
    let duration;
    if (dragType === 'lunch') {
        duration = LUNCH_DURATION;
    } else if (dragType === 'techBreak') {
        duration = TECH_BREAK_DURATION;
    } else if (dragType === 'appointment') {
        duration = SLOT_DURATION;
    }

    // Constrain to day bounds
    const dayStartMin = timeToMinutes(DAY_START);
    const dayEndMin = timeToMinutes(DAY_END);

    newMinutes = Math.max(dayStartMin, newMinutes);
    newMinutes = Math.min(dayEndMin - duration, newMinutes);

    currentTime = minutesToTime(newMinutes);

    // Notify about drag position
    onDragMove({
        type: dragType,
        breakId: dragBreakId,
        originalTime: startTime,
        currentTime: currentTime,
        deltaY: deltaY
    });

    // Visual feedback with transform (keep in place, show ghost elsewhere)
    const offsetY = (newMinutes - startMinutes) * PX_PER_MINUTE;
    dragTarget.style.transform = `translateY(${offsetY}px)`;
}

/**
 * Handle pointer up event (end drag)
 * @param {PointerEvent} e - Pointer event
 */
function handlePointerUp(e) {
    if (!isDragging) return;

    isDragging = false;

    // Reset visual feedback
    if (dragTarget) {
        dragTarget.style.cursor = 'grab';
        dragTarget.style.opacity = '';
        dragTarget.style.zIndex = '';
        dragTarget.style.transform = '';
        dragTarget.releasePointerCapture(e.pointerId);
    }

    // Remove listeners
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerUp);

    // Check if position actually changed
    if (currentTime !== startTime) {
        // Trigger preview mode with proposed changes
        onDragEnd({
            type: dragType,
            breakId: dragBreakId,
            originalTime: startTime,
            proposedTime: currentTime
        });
    }

    // Reset state
    dragTarget = null;
    dragType = null;
    dragBreakId = null;
    startTime = null;
    currentTime = null;
    startY = 0;
}

/**
 * Cancel any active drag operation
 */
export function cancelDrag() {
    if (isDragging && dragTarget) {
        dragTarget.style.cursor = 'grab';
        dragTarget.style.opacity = '';
        dragTarget.style.zIndex = '';
        dragTarget.style.transform = '';
    }

    isDragging = false;
    dragTarget = null;
    dragType = null;
    dragBreakId = null;
    startTime = null;
    currentTime = null;
    startY = 0;

    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerUp);
}

/**
 * Check if currently dragging
 * @returns {boolean} True if dragging
 */
export function isDraggingActive() {
    return isDragging;
}
