/**
 * scheduler.js - Schedule generation and reflow engine
 * Handles slot generation, break management, and appointment reflow
 */

// Constants from PRD
export const DAY_START = '09:00';
export const DAY_END = '19:00';
export const SLOT_DURATION = 45; // minutes
export const LUNCH_DURATION = 60; // minutes
export const TECH_BREAK_DURATION = 15; // minutes
export const SNAP_INCREMENT = 15; // minutes

// Pixel scale: 15 min = 24px
export const PX_PER_15MIN = 24;
export const PX_PER_MINUTE = PX_PER_15MIN / 15;

/**
 * Convert time string "HH:MM" to minutes since midnight
 */
export function timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to "HH:MM" format
 */
export function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Calculate pixel height for a duration
 */
export function durationToPx(minutes) {
    return Math.round(minutes * PX_PER_MINUTE);
}

/**
 * Calculate top offset in pixels from day start
 */
export function timeToTopPx(time) {
    const dayStartMinutes = timeToMinutes(DAY_START);
    const timeMinutes = timeToMinutes(time);
    return durationToPx(timeMinutes - dayStartMinutes);
}

/**
 * Snap time to nearest increment (for visual drag feedback)
 */
export function snapToGrid(minutes, increment = SNAP_INCREMENT) {
    return Math.round(minutes / increment) * increment;
}

/**
 * Snap time to nearest slot boundary (45-min increments from day start)
 * This ensures breaks don't create wasted time gaps
 */
export function snapToSlotBoundary(minutes) {
    const dayStartMinutes = timeToMinutes(DAY_START);
    const relativeMinutes = minutes - dayStartMinutes;
    const snappedRelative = Math.round(relativeMinutes / SLOT_DURATION) * SLOT_DURATION;
    return dayStartMinutes + snappedRelative;
}

/**
 * Create a new empty state object
 */
export function createInitialState() {
    return {
        ui: {
            theme: 'light',
            language: 'pt',
            previewMode: false,
            selectedSlotId: null,
            drawerOpen: false
        },
        schedule: {
            lunchStart: '13:00',
            techBreaks: [], // Array of { id, start }
            appointments: [] // Array of { id, start, isBooked, name, contact, notes, status }
        },
        proposed: null,
        needsReschedule: [],
        computed: {
            slots: []
        }
    };
}

/**
 * Generate a unique ID
 */
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Build list of blocked intervals from lunch, tech breaks, AND appointments
 */
function buildBlockedIntervals(schedule, includeAppointments = true) {
    const blocked = [];

    // Add lunch block
    const lunchStartMin = timeToMinutes(schedule.lunchStart);
    blocked.push({
        start: lunchStartMin,
        end: lunchStartMin + LUNCH_DURATION,
        type: 'lunch'
    });

    // Add tech breaks
    for (const tb of schedule.techBreaks) {
        const tbStartMin = timeToMinutes(tb.start);
        blocked.push({
            start: tbStartMin,
            end: tbStartMin + TECH_BREAK_DURATION,
            type: 'techBreak',
            id: tb.id
        });
    }

    // Add booked appointments as blocks (like lunch)
    if (includeAppointments) {
        for (const apt of schedule.appointments) {
            if (apt.isBooked && apt.start) {
                const aptStartMin = timeToMinutes(apt.start);
                blocked.push({
                    start: aptStartMin,
                    end: aptStartMin + SLOT_DURATION,
                    type: 'bookedAppointment',
                    id: apt.id,
                    data: apt
                });
            }
        }
    }

    blocked.sort((a, b) => a.start - b.start);
    return blocked;
}

/**
 * Build list of available intervals (not blocked)
 */
function buildAvailableIntervals(blocked) {
    const dayStart = timeToMinutes(DAY_START);
    const dayEnd = timeToMinutes(DAY_END);
    const available = [];
    let cursor = dayStart;

    for (const block of blocked) {
        if (block.start > cursor) {
            available.push({
                start: cursor,
                end: Math.min(block.start, dayEnd)
            });
        }
        cursor = Math.max(cursor, block.end);
    }

    if (cursor < dayEnd) {
        available.push({
            start: cursor,
            end: dayEnd
        });
    }

    return available;
}

/**
 * Generate appointment slots from available intervals
 */
function generateSlots(available) {
    const slots = [];
    let slotIndex = 0;

    for (const interval of available) {
        let cursor = interval.start;

        while (cursor + SLOT_DURATION <= interval.end) {
            slots.push({
                id: `slot-${slotIndex}`,
                start: minutesToTime(cursor),
                end: minutesToTime(cursor + SLOT_DURATION),
                type: 'appointment',
                slotIndex: slotIndex
            });
            cursor += SLOT_DURATION;
            slotIndex++;
        }
    }

    return slots;
}

/**
 * Main reflow function - regenerate schedule when breaks change
 * Now treats appointments as time-based blocks (like lunch)
 */
export function reflow(schedule) {
    const dayEnd = timeToMinutes(DAY_END);
    const dayStart = timeToMinutes(DAY_START);

    // Build blocked intervals (including appointments)
    const blocked = buildBlockedIntervals(schedule, true);

    // Build available intervals (gaps between all blocks)
    const available = buildAvailableIntervals(blocked);

    // Generate empty slots from available intervals
    const slots = generateSlots(available);

    // Keep track of booked appointments
    const bookedAppointments = schedule.appointments.filter(apt => apt.isBooked);
    const needsReschedule = [];

    // Build the full schedule items list (for rendering)
    const scheduleItems = [];
    let itemCursor = dayStart;

    const allBlocks = [...blocked];
    let slotIdx = 0;

    while (itemCursor < dayEnd || slotIdx < slots.length) {
        const nextBlock = allBlocks.find(b => b.start >= itemCursor);
        const nextSlot = slots[slotIdx];

        if (nextSlot && (!nextBlock || timeToMinutes(nextSlot.start) < nextBlock.start)) {
            // Empty slot
            scheduleItems.push(nextSlot);
            itemCursor = timeToMinutes(nextSlot.end);
            slotIdx++;
        } else if (nextBlock) {
            // Block (lunch, tech break, or booked appointment)
            const item = {
                id: nextBlock.id || `${nextBlock.type}-${nextBlock.start}`,
                start: minutesToTime(nextBlock.start),
                end: minutesToTime(nextBlock.end),
                type: nextBlock.type
            };
            // If it's a booked appointment, attach data
            if (nextBlock.type === 'bookedAppointment') {
                item.data = nextBlock.data;
            }
            scheduleItems.push(item);
            itemCursor = nextBlock.end;
            const idx = allBlocks.indexOf(nextBlock);
            if (idx > -1) allBlocks.splice(idx, 1);
        } else {
            break;
        }
    }

    return {
        slots,
        scheduleItems,
        appointments: bookedAppointments,
        needsReschedule
    };
}

/**
 * Add a technical break
 */
export function addTechBreak(schedule, start) {
    const newBreak = {
        id: generateId(),
        start: start
    };

    return {
        ...schedule,
        techBreaks: [...schedule.techBreaks, newBreak]
    };
}

/**
 * Remove a technical break
 */
export function removeTechBreak(schedule, breakId) {
    return {
        ...schedule,
        techBreaks: schedule.techBreaks.filter(tb => tb.id !== breakId)
    };
}

/**
 * Move lunch to a new start time (snapped to slot boundary)
 */
export function moveLunch(schedule, newStart) {
    // Snap to nearest slot boundary to avoid wasted time gaps
    const newStartMin = timeToMinutes(newStart);
    const snappedMin = snapToSlotBoundary(newStartMin);

    // Ensure lunch stays within day bounds
    const dayStartMin = timeToMinutes(DAY_START);
    const dayEndMin = timeToMinutes(DAY_END);
    const constrainedMin = Math.max(dayStartMin, Math.min(snappedMin, dayEndMin - LUNCH_DURATION));

    return {
        ...schedule,
        lunchStart: minutesToTime(constrainedMin)
    };
}

/**
 * Move a tech break to a new start time (snapped to slot boundary)
 */
export function moveTechBreak(schedule, breakId, newStart) {
    // Snap to nearest slot boundary
    const newStartMin = timeToMinutes(newStart);
    const snappedMin = snapToSlotBoundary(newStartMin);

    // Ensure break stays within day bounds
    const dayStartMin = timeToMinutes(DAY_START);
    const dayEndMin = timeToMinutes(DAY_END);
    const constrainedMin = Math.max(dayStartMin, Math.min(snappedMin, dayEndMin - TECH_BREAK_DURATION));

    return {
        ...schedule,
        techBreaks: schedule.techBreaks.map(tb =>
            tb.id === breakId ? { ...tb, start: minutesToTime(constrainedMin) } : tb
        )
    };
}

/**
 * Book an appointment at a specific start time
 * @param {Object} schedule - Current schedule
 * @param {string} startTime - Start time "HH:MM"
 * @param {Object} details - Appointment details
 * @param {string} [appointmentId] - Optional, for updating existing
 */
export function bookAppointment(schedule, startTime, details, appointmentId = null) {
    // Snap to nearest slot boundary
    const startMin = timeToMinutes(startTime);
    const snappedMin = snapToSlotBoundary(startMin);
    const snappedTime = minutesToTime(snappedMin);

    if (appointmentId) {
        // Update existing appointment
        return {
            ...schedule,
            appointments: schedule.appointments.map(a =>
                a.id === appointmentId
                    ? { ...a, ...details, start: snappedTime, isBooked: true }
                    : a
            )
        };
    }

    // Create new appointment
    const newApt = {
        id: generateId(),
        start: snappedTime,
        isBooked: true,
        name: details.name || '',
        contact: details.contact || '',
        notes: details.notes || '',
        status: details.status || 'scheduled',
        createdAt: new Date().toISOString()
    };

    return {
        ...schedule,
        appointments: [...schedule.appointments, newApt]
    };
}

/**
 * Clear an appointment by ID
 */
export function clearAppointment(schedule, appointmentId) {
    return {
        ...schedule,
        appointments: schedule.appointments.filter(a => a.id !== appointmentId)
    };
}

/**
 * Get appointment by ID
 */
export function getAppointmentById(schedule, appointmentId) {
    return schedule.appointments.find(a => a.id === appointmentId) || null;
}

/**
 * Get appointment by slot index (legacy, for backward compat)
 */
export function getAppointmentBySlot(schedule, slotIndex) {
    // No longer used with time-based system
    return null;
}

/**
 * Move appointment to a new start time (snapped to slot boundary)
 */
export function moveAppointment(schedule, appointmentId, newStartTime) {
    // Snap to nearest slot boundary
    const startMin = timeToMinutes(newStartTime);
    const snappedMin = snapToSlotBoundary(startMin);
    const snappedTime = minutesToTime(snappedMin);

    return {
        ...schedule,
        appointments: schedule.appointments.map(a =>
            a.id === appointmentId ? { ...a, start: snappedTime } : a
        )
    };
}
