/**
 * auth.js - Firebase Authentication & Role Management
 * Handles login, logout, and session state using Firebase Auth
 */

import { db, auth } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    createUserWithEmailAndPassword,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const SESSION_KEY = 'skin-moments-session';

// ==========================================
// Admin Authentication (Firebase Auth)
// ==========================================

export async function loginAdmin(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Fetch user role details
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};

        const session = {
            isAdmin: true,
            uid: user.uid,
            email: user.email,
            name: userData.name || user.email.split('@')[0],
            role: userData.role || 'viewer',
            loginAt: new Date().toISOString()
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return { success: true, session };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: error.code };
    }
}

export async function signUpAdmin(name, email, password) {
    try {
        // Create Authentication User
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Create User Profile in Firestore
        // Security Rules guard this: only allowed if email is in 'invites'
        // OR if it's the hardcoded owner (alexandra)
        await setDoc(doc(db, 'users', user.uid), {
            name,
            email,
            role: email === 'jose.antonio@skinselflove.com.pt' ? 'owner' : 'admin',
            createdAt: new Date().toISOString()
        });

        const session = {
            isAdmin: true,
            uid: user.uid,
            email: user.email,
            name: name,
            role: 'admin',
            loginAt: new Date().toISOString()
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return { success: true };
    } catch (error) {
        console.error('Sign Up error:', error);
        return { success: false, error: error.code };
    }
}

export async function logout() {
    try {
        await firebaseSignOut(auth);
        localStorage.removeItem(SESSION_KEY);
        window.location.href = './index.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ==========================================
// Pharmacy Authentication (Legacy/Custom)
// ==========================================

export async function loginPharmacy(id, pin) {
    try {
        const docRef = doc(db, 'pharmacies', id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return { success: false, error: 'pharmacy_not_found' };
        }

        const data = docSnap.data();
        if (!data.active) {
            return { success: false, error: 'pharmacy_inactive' };
        }

        // Construct standardized email and strict password from PIN
        const email = `${id}@medik8.local`;
        // Ensure "00" padding logic matches migration
        const password = pin.length < 6 ? `${pin}00` : pin;

        try {
            await signInWithEmailAndPassword(auth, email, password);

            // Success! Create session object
            const session = {
                isAdmin: false,
                pharmacyId: id,
                name: data.name,
                loginAt: new Date().toISOString()
            };

            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            return { success: true, session };

        } catch (authError) {
            console.error("Auth failed:", authError);
            if (authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
                // Map to legacy "invalid_pin" error for UI consistency
                return { success: false, error: 'invalid_pin' };
            }
            return { success: false, error: authError.code };
        }
    } catch (error) {
        console.error('Pharmacy login error:', error);
        return { success: false, error: 'network_error' };
    }
}

// ==========================================
// Session & Auth State
// ==========================================

export function getSession() {
    const sessionStr = localStorage.getItem(SESSION_KEY);
    if (!sessionStr) return null;
    return JSON.parse(sessionStr);
}

export function isAdmin() {
    const session = getSession();
    return session && session.isAdmin;
}

export function initAuth(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const session = getSession();
            // Sync local session with Firebase User if mismatch or missing
            if (!session || session.uid !== user.uid) {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                const userData = userDoc.exists() ? userDoc.data() : {};

                localStorage.setItem(SESSION_KEY, JSON.stringify({
                    isAdmin: true,
                    uid: user.uid,
                    email: user.email,
                    name: userData.name || user.email,
                    role: userData.role || 'admin',
                    loginAt: new Date().toISOString()
                }));
            }
        } else {
            // Only clear session if it was an admin session (to allow pharmacy sessions to persist independently of Firebase Auth if needed)
            // But since Firebase Auth is now core, we should respect it.
            // If pharmacy login doesn't use Firebase Auth, we shouldn't clear it here?
            // Current pharmacy logic is custom. `user` will be null.
            // Check if current session is pharmacy
            const session = getSession();
            if (session && session.isAdmin) {
                localStorage.removeItem(SESSION_KEY);
            }
        }
        if (callback) callback(user);
    });
}

// ==========================================
// Data Helpers
// ==========================================

export async function getPharmacyList() {
    try {
        const colRef = collection(db, 'pharmacies');
        const snapshot = await getDocs(colRef);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error(error);
        return [];
    }
}

export async function getPharmacy(id) {
    // Helper to get pharmacy data by ID (used for session hydration if needed)
    // Not strictly needed if session has name, but good for validation
    try {
        const d = await getDoc(doc(db, 'pharmacies', id));
        return d.exists() ? d.data() : null;
    } catch (e) { return null; }
}

export async function getAssignedDates(monthKey) {
    try {
        const session = getSession();
        if (!session) return [];

        const assignmentsRef = collection(db, 'dateAssignments');
        const startDate = `${monthKey}-01`;
        const endDate = `${monthKey}-31`;

        let q;
        if (session.isAdmin) {
            q = query(assignmentsRef, where('date', '>=', startDate), where('date', '<=', endDate));
        } else {
            q = query(assignmentsRef, where('pharmacyId', '==', session.pharmacyId));
        }

        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(doc => doc.data().date)
            .filter(date => date.startsWith(monthKey));
    } catch (error) {
        console.error('Error fetching assigned dates:', error);
        return [];
    }
}

export async function checkDateAssignment(dateStr) {
    try {
        const session = getSession();
        if (!session) return { allowed: false, reason: 'unauthorized' };
        if (session.isAdmin) return { allowed: true };

        const assignmentDoc = await getDoc(doc(db, 'dateAssignments', dateStr));
        if (!assignmentDoc.exists()) return { allowed: false, reason: 'dateNotAssigned' };

        if (assignmentDoc.data().pharmacyId !== session.pharmacyId) {
            return { allowed: false, reason: 'dateAssignedToOther' };
        }

        return { allowed: true };
    } catch (e) {
        console.error(e);
        return { allowed: false, reason: 'error' };
    }
}
