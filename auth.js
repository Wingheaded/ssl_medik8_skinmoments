/**
 * auth.js - Authentication and Session Management
 * Handles pharmacy login, admin detection, and session state
 */

import { db } from './firebase-config.js';
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// ==========================================
// Constants
// ==========================================

const SESSION_KEY = 'ssl_session';
const ADMIN_EMAIL = 'alexandra@skinselflove.pt'; // Admin email for identification

// ==========================================
// Session Management
// ==========================================

/**
 * Get current session from sessionStorage
 * @returns {Object|null} Session object or null
 */
export function getSession() {
    try {
        const sessionData = sessionStorage.getItem(SESSION_KEY);
        return sessionData ? JSON.parse(sessionData) : null;
    } catch (e) {
        console.error('Error reading session:', e);
        return null;
    }
}

/**
 * Save session to sessionStorage
 * @param {Object} session - Session data { pharmacyId, pharmacyName, isAdmin }
 */
function saveSession(session) {
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
        console.error('Error saving session:', e);
    }
}

/**
 * Clear current session (logout)
 */
export function clearSession() {
    try {
        sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
        console.error('Error clearing session:', e);
    }
}

// ==========================================
// Authentication Functions
// ==========================================

/**
 * Check if current user is Admin
 * @returns {boolean}
 */
export function isAdmin() {
    const session = getSession();
    return session?.isAdmin === true;
}

/**
 * Check if user is logged in (admin or pharmacy)
 * @returns {boolean}
 */
export function isLoggedIn() {
    return getSession() !== null;
}

/**
 * Get current pharmacy info
 * @returns {Object|null} { pharmacyId, pharmacyName } or null
 */
export function getPharmacy() {
    const session = getSession();
    if (!session || session.isAdmin) return null;
    return {
        pharmacyId: session.pharmacyId,
        pharmacyName: session.pharmacyName
    };
}

/**
 * Login as a pharmacy using PIN
 * @param {string} pharmacyId - Pharmacy document ID
 * @param {string} pin - 4-digit PIN
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function loginPharmacy(pharmacyId, pin) {
    try {
        const pharmacyRef = doc(db, 'pharmacies', pharmacyId);
        const pharmacySnap = await getDoc(pharmacyRef);

        if (!pharmacySnap.exists()) {
            return { success: false, error: 'pharmacy_not_found' };
        }

        const pharmacy = pharmacySnap.data();

        if (!pharmacy.active) {
            return { success: false, error: 'pharmacy_inactive' };
        }

        // Simple PIN comparison (in production, use hashed comparison)
        if (pharmacy.pin !== pin) {
            return { success: false, error: 'invalid_pin' };
        }

        // Create session
        saveSession({
            pharmacyId: pharmacyId,
            pharmacyName: pharmacy.name,
            isAdmin: false,
            loginAt: new Date().toISOString()
        });

        return { success: true };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: 'network_error' };
    }
}

/**
 * Login as Admin using password
 * @param {string} password - Admin password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
/**
 * Login as Admin using Email and Password
 * @param {string} email - Admin email
 * @param {string} password - Admin password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function loginAdmin(email, password) {
    try {
        // 1. Check 'admins' collection (Multi-Admin)
        const adminsRef = collection(db, 'admins');
        const q = query(adminsRef, where('email', '==', email), where('active', '==', true));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const adminDoc = snapshot.docs[0];
            const adminData = adminDoc.data();

            // Simple password comparison (in production, use hash)
            if (adminData.password === password) {
                saveSession({
                    isAdmin: true,
                    adminId: adminDoc.id,
                    name: adminData.name,
                    email: adminData.email,
                    permissions: adminData.permissions || [],
                    loginAt: new Date().toISOString()
                });
                return { success: true };
            } else {
                return { success: false, error: 'invalid_password' };
            }
        }

        // 2. Fallback: Legacy/Master Admin
        // Check if email matches generic admin or is empty (legacy call)
        if (email === ADMIN_EMAIL || email === 'admin') {
            const configRef = doc(db, 'config', 'admin');
            const configSnap = await getDoc(configRef);

            if (!configSnap.exists()) {
                // Initial setup fallback
                if (password === 'skinmoments2026') {
                    saveSession({
                        isAdmin: true,
                        master: true,
                        email: ADMIN_EMAIL,
                        loginAt: new Date().toISOString()
                    });
                    return { success: true };
                }
                return { success: false, error: 'admin_not_configured' };
            }

            const config = configSnap.data();
            if (config.adminPassword === password) {
                saveSession({
                    isAdmin: true,
                    master: true,
                    email: ADMIN_EMAIL,
                    loginAt: new Date().toISOString()
                });
                return { success: true };
            }
            return { success: false, error: 'invalid_password' };
        }

        return { success: false, error: 'user_not_found' };

    } catch (error) {
        console.error('Admin login error:', error);
        return { success: false, error: 'network_error' };
    }
}

/**
 * Logout current user
 */
export function logout() {
    clearSession();
    window.location.href = './index.html';
}

// ==========================================
// Pharmacy Data Functions
// ==========================================

/**
 * Get list of all active pharmacies (for login dropdown)
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getPharmacyList() {
    try {
        const pharmaciesRef = collection(db, 'pharmacies');
        const q = query(pharmaciesRef, where('active', '==', true));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name
        }));
    } catch (error) {
        console.error('Error fetching pharmacies:', error);
        return [];
    }
}

// ==========================================
// Date Assignment Functions
// ==========================================

/**
 * Check if a date is assigned to the current pharmacy
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<boolean>}
 */
export async function isDateAssignedToMe(dateStr) {
    const session = getSession();
    if (!session) return false;
    if (session.isAdmin) return true; // Admin can access all dates

    try {
        const assignmentRef = doc(db, 'dateAssignments', dateStr);
        const assignmentSnap = await getDoc(assignmentRef);

        if (!assignmentSnap.exists()) return false;

        return assignmentSnap.data().pharmacyId === session.pharmacyId;
    } catch (error) {
        console.error('Error checking date assignment:', error);
        return false;
    }
}

/**
 * Get all dates assigned to current pharmacy for a month
 * @param {string} monthKey - Month in YYYY-MM format
 * @returns {Promise<Array<string>>} Array of assigned date strings
 */
export async function getAssignedDatesForMonth(monthKey) {
    const session = getSession();
    if (!session) return [];

    try {
        const assignmentsRef = collection(db, 'dateAssignments');

        // Query dates that start with the month key
        const startDate = `${monthKey}-01`;
        const endDate = `${monthKey}-31`;

        let q;
        if (session.isAdmin) {
            // Admin sees all assigned dates
            q = query(
                assignmentsRef,
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
        } else {
            // Pharmacy sees only their assigned dates
            q = query(
                assignmentsRef,
                where('pharmacyId', '==', session.pharmacyId)
            );
        }

        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(doc => doc.data().date || doc.id)
            .filter(date => date.startsWith(monthKey));
    } catch (error) {
        console.error('Error fetching assigned dates:', error);
        return [];
    }
}

// ==========================================
// Authorization Helpers
// ==========================================

/**
 * Check if current user can book on a specific date
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function canBookOnDate(dateStr) {
    const session = getSession();

    if (!session) {
        return { allowed: false, reason: 'not_logged_in' };
    }

    if (session.isAdmin) {
        return { allowed: true };
    }

    const isAssigned = await isDateAssignedToMe(dateStr);
    if (!isAssigned) {
        return { allowed: false, reason: 'date_not_assigned' };
    }

    return { allowed: true };
}

/**
 * Check if there are any admins configured
 * @returns {Promise<boolean>}
 */
export async function checkAnyAdmins() {
    try {
        const adminsRef = collection(db, 'admins');
        const q = query(adminsRef, limit(1));
        const snapshot = await getDocs(q);
        return !snapshot.empty;
    } catch (error) {
        console.error('Error checking admins:', error);
        return false;
    }
}

/**
 * Register the first admin (Setup Mode)
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function registerFirstAdmin(name, email, password) {
    if (await checkAnyAdmins()) {
        return { success: false, error: 'admin_already_configured' };
    }

    try {
        const docId = `admin_${Date.now()}`;
        await setDoc(doc(db, 'admins', docId), {
            name,
            email,
            password, // Use hashing in production
            active: true,
            createdAt: new Date().toISOString()
        });

        saveSession({
            isAdmin: true,
            adminId: docId,
            name,
            email,
            loginAt: new Date().toISOString()
        });

        return { success: true };
    } catch (error) {
        console.error('Error creating first admin:', error);
        return { success: false, error: 'network_error' };
    }
}
