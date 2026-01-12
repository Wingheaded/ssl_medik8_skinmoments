/**
 * scheduler.js - Schedule generation and reflow engine
 * Ordered Block Model - times calculated from block positions
 */

// Constants from PRD
export const DAY_START = '09:00';
export const DAY_END = '19:00';
export const SLOT_DURATION = 45; // minutes (appointments)
export const LUNCH_DURATION = 60; // minutes
export const TECH_BREAK_DURATION = 15; // minutes
export const SNAP_INCREMENT = 15; // minutes

// Pixel scale: 15 min = 24px
export const PX_PER_15MIN = 24;
export const PX_PER_MINUTE = PX_PER_15MIN / 15;

// Block types
export const BLOCK_TYPES = {
    SLOT: 'slot',
    LUNCH: 'lunch',
    TECH_BREAK: 'techBreak'
};

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
 * Get duration for a block type
 */
export function getBlockDuration(blockType) {
    switch (blockType) {
        case BLOCK_TYPES.SLOT:
            return SLOT_DURATION;
        case BLOCK_TYPES.LUNCH:
            return LUNCH_DURATION;
        case BLOCK_TYPES.TECH_BREAK:
            return TECH_BREAK_DURATION;
        default:
            return SLOT_DURATION;
    }
}

/**
 * Generate a unique ID
 */
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create default block list to fill the day
 * @param {number} lunchPosition - Position in list for lunch (0-indexed)
 */
function createDefaultBlocks(lunchPosition = 4) {
    const dayStartMin = timeToMinutes(DAY_START);
    const dayEndMin = timeToMinutes(DAY_END);
    const totalMinutes = dayEndMin - dayStartMin; // 600 min = 10 hours

    const blocks = [];
    let currentMinutes = 0;
    let slotCount = 0;
    let hasLunch = false;

    // Fill the day with slots and one lunch
    while (currentMinutes < totalMinutes) {
        if (!hasLunch && slotCount === lunchPosition) {
            // Insert lunch at this position (only once)
            blocks.push({
                type: BLOCK_TYPES.LUNCH,
                id: 'lunch'
            });
            currentMinutes += LUNCH_DURATION;
            hasLunch = true;
        } else if (currentMinutes + SLOT_DURATION <= totalMinutes) {
            blocks.push({
                type: BLOCK_TYPES.SLOT,
                id: generateId()
            });
            currentMinutes += SLOT_DURATION;
            slotCount++;
        } else {
            // Not enough time for another slot
            break;
        }
    }

    return blocks;
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
            selectedBlockIndex: null,
            drawerOpen: false
        },
        schedule: {
            blocks: createDefaultBlocks(4), // Lunch at position 4 (around 12:00)
            appointments: {} // Map: blockId -> appointment data
        },
        proposed: null,
        needsReschedule: [],
        computed: {
            slots: []
        }
    };
}

/**
 * Migrate old schedule format to new blocks format
 * Old format: { lunchStart, techBreaks, appointments (by time) }
 * New format: { blocks, appointments (by blockId) }
 */
function migrateOldScheduleFormat(schedule) {
    const dayStartMin = timeToMinutes(DAY_START);
    const dayEndMin = timeToMinutes(DAY_END);

    // Already has blocks array
    if (schedule.blocks && Array.isArray(schedule.blocks)) {
        // Validate there's only one lunch
        const lunchCount = schedule.blocks.filter(b => b.type === BLOCK_TYPES.LUNCH).length;

        if (lunchCount > 1) {
            // Fix corrupted data - keep only first lunch
            let foundLunch = false;
            schedule.blocks = schedule.blocks.filter(b => {
                if (b.type === BLOCK_TYPES.LUNCH) {
                    if (foundLunch) return false;
                    foundLunch = true;
                }
                return true;
            });
        }

        // Pad schedule with slots to fill the full day
        let currentMinutes = 0;
        for (const block of schedule.blocks) {
            currentMinutes += getBlockDuration(block.type);
        }

        const totalDayMinutes = dayEndMin - dayStartMin;
        while (currentMinutes + SLOT_DURATION <= totalDayMinutes) {
            schedule.blocks.push({
                type: BLOCK_TYPES.SLOT,
                id: generateId()
            });
            currentMinutes += SLOT_DURATION;
        }

        // Ensure there's at least one lunch block
        if (lunchCount === 0) {
            // Insert lunch at position 4 (or end if less blocks)
            const lunchPos = Math.min(4, schedule.blocks.length);
            schedule.blocks.splice(lunchPos, 0, {
                type: BLOCK_TYPES.LUNCH,
                id: 'lunch'
            });
        }

        return schedule;
    }

    // Create fresh blocks for old/invalid data
    const blocks = createDefaultBlocks(4);

    // Migrate appointments if they exist (old format used time as key)
    const newAppointments = {};
    if (schedule.appointments) {
        // Old appointments were keyed by time - need to map to block IDs
        // For simplicity, just reset appointments on migration
        // (old format is incompatible)
    }

    return {
        blocks,
        appointments: newAppointments
    };
}

/**
 * Main reflow function - calculate times from block order
 * @param {Object} schedule - Contains blocks and appointments
 * @returns {Object} - scheduleItems with calculated times
 */
export function reflow(schedule) {
    const dayStartMin = timeToMinutes(DAY_START);
    const dayEndMin = timeToMinutes(DAY_END);

    // Migrate old data format if needed
    const migratedSchedule = migrateOldScheduleFormat(schedule);
    schedule.blocks = migratedSchedule.blocks;
    schedule.appointments = migratedSchedule.appointments || schedule.appointments || {};

    const scheduleItems = [];
    const slots = [];
    const appointments = [];
    let currentTime = dayStartMin;

    for (let i = 0; i < schedule.blocks.length; i++) {
        const block = schedule.blocks[i];
        const duration = getBlockDuration(block.type);

        // Check if we exceed day end
        if (currentTime + duration > dayEndMin) {
            break;
        }

        const startTime = minutesToTime(currentTime);
        const endTime = minutesToTime(currentTime + duration);

        const item = {
            id: block.id,
            type: block.type,
            start: startTime,
            end: endTime,
            blockIndex: i,
            duration: duration
        };

        // If it's a slot, check for appointment data
        if (block.type === BLOCK_TYPES.SLOT) {
            const aptData = schedule.appointments[block.id];
            if (aptData && aptData.isBooked) {
                item.type = 'bookedAppointment';
                item.data = aptData;
                item.isBooked = true;
                appointments.push({
                    ...aptData,
                    id: block.id,
                    start: startTime,
                    blockIndex: i,
                    isBooked: true
                });
            } else {
                slots.push({
                    id: block.id,
                    start: startTime,
                    end: endTime,
                    blockIndex: i,
                    type: 'slot'
                });
            }
        }

        scheduleItems.push(item);
        currentTime += duration;
    }

    return {
        scheduleItems,
        slots, // Empty (available) slots
        appointments, // Booked appointments
        needsReschedule: []
    };
}

/**
 * Insert a block at a specific position
 */
export function insertBlock(schedule, position, blockType, id = null) {
    const newBlock = {
        type: blockType,
        id: id || generateId()
    };

    const newBlocks = [...schedule.blocks];
    newBlocks.splice(position, 0, newBlock);

    return {
        ...schedule,
        blocks: newBlocks
    };
}

/**
 * Remove a block at a specific position or by ID
 */
export function removeBlock(schedule, positionOrId) {
    let newBlocks;

    if (typeof positionOrId === 'number') {
        newBlocks = schedule.blocks.filter((_, idx) => idx !== positionOrId);
    } else {
        newBlocks = schedule.blocks.filter(b => b.id !== positionOrId);
    }

    return {
        ...schedule,
        blocks: newBlocks
    };
}

/**
 * Move a block from one position to another
 */
export function moveBlock(schedule, fromIndex, toIndex) {
    const newBlocks = [...schedule.blocks];
    const [movedBlock] = newBlocks.splice(fromIndex, 1);
    newBlocks.splice(toIndex, 0, movedBlock);

    return {
        ...schedule,
        blocks: newBlocks
    };
}

/**
 * Find block index by ID
 */
export function findBlockIndex(schedule, blockId) {
    return schedule.blocks.findIndex(b => b.id === blockId);
}

/**
 * Add a technical break at a position
 */
export function addTechBreak(schedule, position = null) {
    // If no position specified, add after the first block
    const pos = position !== null ? position : 1;
    return insertBlock(schedule, pos, BLOCK_TYPES.TECH_BREAK);
}

/**
 * Remove a technical break by ID
 */
export function removeTechBreak(schedule, breakId) {
    return removeBlock(schedule, breakId);
}

/**
 * Move lunch to a new position
 */
export function moveLunch(schedule, newPosition) {
    const lunchIndex = schedule.blocks.findIndex(b => b.type === BLOCK_TYPES.LUNCH);
    if (lunchIndex === -1) return schedule;

    return moveBlock(schedule, lunchIndex, newPosition);
}

/**
 * Move a tech break to a new position
 */
export function moveTechBreak(schedule, breakId, newPosition) {
    const breakIndex = findBlockIndex(schedule, breakId);
    if (breakIndex === -1) return schedule;

    return moveBlock(schedule, breakIndex, newPosition);
}

/**
 * Book an appointment (store data for a slot)
 */
export function bookAppointment(schedule, blockId, details) {
    return {
        ...schedule,
        appointments: {
            ...schedule.appointments,
            [blockId]: {
                ...details,
                isBooked: true,
                createdAt: new Date().toISOString()
            }
        }
    };
}

/**
 * Clear an appointment
 */
export function clearAppointment(schedule, blockId) {
    const newAppointments = { ...schedule.appointments };
    delete newAppointments[blockId];

    return {
        ...schedule,
        appointments: newAppointments
    };
}

/**
 * Get appointment by block ID
 */
export function getAppointmentById(schedule, blockId) {
    return schedule.appointments[blockId] || null;
}

/**
 * Move appointment from one slot to another
 */
export function moveAppointment(schedule, fromBlockId, toBlockId) {
    const aptData = schedule.appointments[fromBlockId];
    if (!aptData) return schedule;

    const newAppointments = { ...schedule.appointments };
    delete newAppointments[fromBlockId];
    newAppointments[toBlockId] = aptData;

    return {
        ...schedule,
        appointments: newAppointments
    };
}

/**
 * Calculate what position a Y pixel coordinate corresponds to
 * Used for drag-and-drop
 */
export function pixelToBlockPosition(yPixel, schedule) {
    const dayStartMin = timeToMinutes(DAY_START);
    let currentTop = 0;

    for (let i = 0; i < schedule.blocks.length; i++) {
        const block = schedule.blocks[i];
        const duration = getBlockDuration(block.type);
        const heightPx = durationToPx(duration);

        if (yPixel < currentTop + heightPx / 2) {
            return i;
        }
        currentTop += heightPx;
    }

    return schedule.blocks.length;
}

/**
 * Calculate the Y pixel position for a block index
 */
export function blockPositionToPixel(blockIndex, schedule) {
    let currentTop = 0;

    for (let i = 0; i < blockIndex && i < schedule.blocks.length; i++) {
        const block = schedule.blocks[i];
        const duration = getBlockDuration(block.type);
        currentTop += durationToPx(duration);
    }

    return currentTop;
}

/**
 * Validate schedule fits within day bounds
 */
export function validateSchedule(schedule) {
    const dayStartMin = timeToMinutes(DAY_START);
    const dayEndMin = timeToMinutes(DAY_END);

    let totalMinutes = 0;
    for (const block of schedule.blocks) {
        totalMinutes += getBlockDuration(block.type);
    }

    const exceeds = totalMinutes > (dayEndMin - dayStartMin);
    return {
        valid: !exceeds,
        totalMinutes,
        maxMinutes: dayEndMin - dayStartMin,
        error: exceeds ? `Schedule exceeds day by ${totalMinutes - (dayEndMin - dayStartMin)} minutes` : null
    };
}

// Legacy exports for backward compatibility
export function snapToSlotBoundary(minutes) {
    const dayStartMin = timeToMinutes(DAY_START);
    const relativeMinutes = minutes - dayStartMin;
    return dayStartMin + Math.round(relativeMinutes / SLOT_DURATION) * SLOT_DURATION;
}

export function findValidTechBreakPosition() {
    // No longer needed - position-based now
    return 0;
}

export function validateScheduleGaps() {
    // No longer needed - no gaps in ordered model
    return null;
}
