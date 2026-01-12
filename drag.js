/**
 * drag.js - Drag interactions with preview/apply mechanism
 * Uses Pointer Events for touch/mouse support
 * Updated for position-based block model
 */

import {
    timeToMinutes,
    minutesToTime,
    durationToPx,
    PX_PER_MINUTE,
    DAY_START,
    DAY_END,
    LUNCH_DURATION,
    TECH_BREAK_DURATION,
    SLOT_DURATION,
    getBlockDuration,
    BLOCK_TYPES
} from './scheduler.js';

let isDragging = false;
let dragTarget = null;
let dragType = null; // 'lunch', 'techBreak', or 'appointment'
let dragBlockId = null;
let dragFromIndex = null; // Starting block index
let startY = 0;
let startOffsetY = 0; // Offset within the block where drag started
let scheduleTop = 0; // Top of schedule container
let blockHeights = []; // Heights of each block for position calculation
let onDragEnd = null;
let onDragMove = null;

/**
 * Initialize drag handlers
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.onPreview - Called when drag ends with proposed position
 * @param {Function} callbacks.onDragUpdate - Called during drag with current position
 */
export function initDrag(callbacks) {
    onDragEnd = callbacks.onDragEnd || (() => { });
    onDragMove = callbacks.onDragUpdate || (() => { });
}

/**
 * Make an element draggable
 * @param {HTMLElement} element - Element to make draggable
 * @param {string} type - 'lunch', 'techBreak', or 'appointment'
 * @param {string} startTimeStr - Current start time "HH:MM"
 * @param {string} [blockId] - Block ID
 * @param {number} [blockIndex] - Current block index in schedule
 */
export function makeDraggable(element, type, startTimeStr, blockId = null, blockIndex = null) {
    element.style.cursor = 'grab';
    element.setAttribute('data-draggable', 'true');
    element.setAttribute('data-drag-type', type);
    element.setAttribute('data-start-time', startTimeStr);
    if (blockId) {
        element.setAttribute('data-block-id', blockId);
    }
    if (blockIndex !== null) {
        element.setAttribute('data-block-index', String(blockIndex));
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
    element.removeAttribute('data-block-id');
    element.removeAttribute('data-block-index');
    element.removeEventListener('pointerdown', handlePointerDown);
}

/**
 * Calculate block heights from all schedule rows
 */
function calculateBlockHeights() {
    const rows = document.querySelectorAll('.schedule__row');
    blockHeights = [];
    rows.forEach(row => {
        blockHeights.push(row.offsetHeight);
    });
    return blockHeights;
}

/**
 * Calculate which block position corresponds to a Y coordinate
 */
function yToBlockPosition(y) {
    let cumulative = 0;
    for (let i = 0; i < blockHeights.length; i++) {
        cumulative += blockHeights[i];
        if (y < cumulative) {
            return i;
        }
    }
    return blockHeights.length - 1;
}

/**
 * Handle pointer down event (start drag)
 * @param {PointerEvent} e - Pointer event
 */
function handlePointerDown(e) {
    // Only handle primary button (left click / touch)
    if (e.button !== 0) return;

    // Don't intercept clicks on buttons (delete, clear, etc.)
    if (e.target.closest('button') || e.target.closest('.techbreak-block__delete-btn') || e.target.closest('.slot__clear-btn')) {
        return;
    }

    e.preventDefault();

    dragTarget = e.currentTarget;
    dragType = dragTarget.getAttribute('data-drag-type');
    dragBlockId = dragTarget.getAttribute('data-block-id');
    dragFromIndex = parseInt(dragTarget.getAttribute('data-block-index') || '0', 10);
    startY = e.clientY;

    // Calculate block heights for position tracking
    calculateBlockHeights();

    // Get schedule container position
    const scheduleBody = document.getElementById('scheduleBody');
    if (scheduleBody) {
        scheduleTop = scheduleBody.getBoundingClientRect().top;
    }

    // Calculate offset within the row
    const targetRect = dragTarget.closest('.schedule__row')?.getBoundingClientRect();
    startOffsetY = targetRect ? e.clientY - targetRect.top : 0;

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

    // Calculate relative Y within schedule
    const relativeY = e.clientY - scheduleTop;

    // Find target block position
    const targetIndex = yToBlockPosition(relativeY);

    // Notify about drag position
    onDragMove({
        type: dragType,
        blockId: dragBlockId,
        fromIndex: dragFromIndex,
        currentIndex: targetIndex,
        deltaY: deltaY
    });

    // Visual feedback with transform
    dragTarget.style.transform = `translateY(${deltaY}px)`;
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

    // Calculate final position
    const relativeY = e.clientY - scheduleTop;
    const toIndex = yToBlockPosition(relativeY);

    // Check if position actually changed
    if (toIndex !== dragFromIndex) {
        // Trigger preview mode with proposed changes
        onDragEnd({
            type: dragType,
            blockId: dragBlockId,
            fromIndex: dragFromIndex,
            toIndex: toIndex
        });
    }

    // Reset state
    dragTarget = null;
    dragType = null;
    dragBlockId = null;
    dragFromIndex = null;
    startY = 0;
    startOffsetY = 0;
    blockHeights = [];
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
    dragBlockId = null;
    dragFromIndex = null;
    startY = 0;
    startOffsetY = 0;
    blockHeights = [];

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
