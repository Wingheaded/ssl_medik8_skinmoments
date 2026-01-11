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
 * Snap time to nearest increment
 */
export function snapToGrid(minutes, increment = SNAP_INCREMENT) {
    return Math.round(minutes / increment) * increment;
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
            appointments: [] // Array of { id, isBooked, name, contact, notes, status, slotIndex }
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
 * Build list of blocked intervals from lunch and tech breaks
 */
function buildBlockedIntervals(schedule) {
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
 */
export function reflow(schedule) {
    const dayEnd = timeToMinutes(DAY_END);

    // Build blocked intervals
    const blocked = buildBlockedIntervals(schedule);

    // Build available intervals
    const available = buildAvailableIntervals(blocked);

    // Generate new slots
    const slots = generateSlots(available);

    // Reassign booked appointments to slots
    const occupiedSlots = new Set();
    const bookedAppointments = schedule.appointments.filter(apt => apt.isBooked);
    const assignedAppointments = [];
    const needsReschedule = [];

    for (const apt of bookedAppointments) {
        if (apt.slotIndex >= 0 && apt.slotIndex < slots.length && !occupiedSlots.has(apt.slotIndex)) {
            assignedAppointments.push(apt);
            slots[apt.slotIndex].appointmentId = apt.id;
            occupiedSlots.add(apt.slotIndex);
        } else {
            needsReschedule.push(apt);
        }
    }

    // Build the full schedule items list (for rendering)
    const scheduleItems = [];
    const dayStart = timeToMinutes(DAY_START);
    let itemCursor = dayStart;

    const allBlocks = [...blocked];
    let slotIdx = 0;

    while (itemCursor < dayEnd || slotIdx < slots.length) {
        const nextBlock = allBlocks.find(b => b.start >= itemCursor);
        const nextSlot = slots[slotIdx];

        if (nextSlot && (!nextBlock || timeToMinutes(nextSlot.start) < nextBlock.start)) {
            scheduleItems.push(nextSlot);
            itemCursor = timeToMinutes(nextSlot.end);
            slotIdx++;
        } else if (nextBlock) {
            scheduleItems.push({
                id: nextBlock.id || `${nextBlock.type}-${nextBlock.start}`,
                start: minutesToTime(nextBlock.start),
                end: minutesToTime(nextBlock.end),
                type: nextBlock.type
            });
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
        appointments: assignedAppointments,
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
 * Move lunch to a new start time
 */
export function moveLunch(schedule, newStart) {
    return {
        ...schedule,
        lunchStart: newStart
    };
}

/**
 * Move a tech break to a new start time
 */
export function moveTechBreak(schedule, breakId, newStart) {
    return {
        ...schedule,
        techBreaks: schedule.techBreaks.map(tb =>
            tb.id === breakId ? { ...tb, start: newStart } : tb
        )
    };
}

/**
 * Book an appointment in a slot
 */
export function bookAppointment(schedule, slotIndex, details) {
    const existingApt = schedule.appointments.find(a => a.slotIndex === slotIndex);

    if (existingApt) {
        return {
            ...schedule,
            appointments: schedule.appointments.map(a =>
                a.slotIndex === slotIndex
                    ? { ...a, ...details, isBooked: true }
                    : a
            )
        };
    }

    const newApt = {
        id: generateId(),
        slotIndex: slotIndex,
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
 * Clear an appointment from a slot
 */
export function clearAppointment(schedule, slotIndex) {
    return {
        ...schedule,
        appointments: schedule.appointments.filter(a => a.slotIndex !== slotIndex)
    };
}

/**
 * Get appointment by slot index
 */
export function getAppointmentBySlot(schedule, slotIndex) {
    return schedule.appointments.find(a => a.slotIndex === slotIndex) || null;
}

/**
 * Move appointment from one slot to another (swap if target occupied)
 */
export function moveAppointment(schedule, fromSlotIndex, toSlotIndex) {
    const fromApt = schedule.appointments.find(a => a.slotIndex === fromSlotIndex);
    const toApt = schedule.appointments.find(a => a.slotIndex === toSlotIndex);

    if (!fromApt) return schedule;

    let updatedAppointments = [...schedule.appointments];

    if (toApt) {
        // Swap
        updatedAppointments = updatedAppointments.map(a => {
            if (a.id === fromApt.id) return { ...a, slotIndex: toSlotIndex };
            if (a.id === toApt.id) return { ...a, slotIndex: fromSlotIndex };
            return a;
        });
    } else {
        // Simple move
        updatedAppointments = updatedAppointments.map(a => {
            if (a.id === fromApt.id) return { ...a, slotIndex: toSlotIndex };
            return a;
        });
    }

    return {
        ...schedule,
        appointments: updatedAppointments
    };
}
