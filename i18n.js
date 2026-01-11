/**
 * i18n.js - Internationalization module
 * Handles language loading, switching, and string lookup
 */

const STORAGE_KEY = 'skin-moments-lang';
let currentStrings = {};
let currentLanguage = 'pt';

/**
 * Detect browser language preference
 * @returns {'pt'|'en'} Detected language code
 */
function detectBrowserLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    return browserLang.startsWith('pt') ? 'pt' : 'en';
}

/**
 * Get the current language
 * @returns {string} Current language code
 */
export function getLanguage() {
    return currentLanguage;
}

/**
 * Load strings for a specific language
 * @param {'pt'|'en'} lang - Language code
 * @returns {Promise<Object>} Loaded strings
 */
async function loadStrings(lang) {
    try {
        const response = await fetch(`./strings.${lang}.json`);
        if (!response.ok) throw new Error(`Failed to load ${lang} strings`);
        return await response.json();
    } catch (error) {
        console.error(`Error loading ${lang} strings:`, error);
        // Fallback to Portuguese if English fails
        if (lang === 'en') {
            const response = await fetch('./strings.pt.json');
            return await response.json();
        }
        return {};
    }
}

/**
 * Set the current language
 * @param {'pt'|'en'} lang - Language code
 * @param {Function} [onComplete] - Callback after language change
 */
export async function setLanguage(lang, onComplete) {
    if (lang !== 'pt' && lang !== 'en') {
        console.warn(`Invalid language: ${lang}, defaulting to 'pt'`);
        lang = 'pt';
    }

    currentLanguage = lang;
    currentStrings = await loadStrings(lang);

    // Persist to localStorage
    try {
        localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
        console.warn('Could not persist language preference:', e);
    }

    // Update document language
    document.documentElement.lang = lang;

    // Call completion callback if provided
    if (typeof onComplete === 'function') {
        onComplete();
    }
}

/**
 * Initialize i18n with stored or detected language
 * @returns {Promise<string>} The language that was loaded
 */
export async function initI18n() {
    // Check localStorage first
    let lang = null;
    try {
        lang = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        console.warn('Could not read language preference:', e);
    }

    // Fall back to browser detection
    if (!lang) {
        lang = detectBrowserLanguage();
    }

    await setLanguage(lang);
    return currentLanguage;
}

/**
 * Get a translated string by key
 * Supports dot notation for nested keys (e.g., 'services.antiAging')
 * @param {string} key - Translation key
 * @param {Object} [params] - Optional interpolation parameters
 * @returns {string} Translated string or key if not found
 */
export function t(key, params = {}) {
    // Handle dot notation for nested keys
    const keys = key.split('.');
    let value = currentStrings;

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            console.warn(`Translation key not found: ${key}`);
            return key;
        }
    }

    if (typeof value !== 'string') {
        console.warn(`Translation value is not a string: ${key}`);
        return key;
    }

    // Simple parameter interpolation (e.g., "Hello {name}" with {name: "World"})
    return value.replace(/\{(\w+)\}/g, (match, param) => {
        return param in params ? params[param] : match;
    });
}

/**
 * Translate all elements with data-i18n attribute
 */
export function translatePage() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = t(key);
        }
    });

    // Handle placeholders
    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
            el.placeholder = t(key);
        }
    });

    // Handle aria-labels
    const ariaLabels = document.querySelectorAll('[data-i18n-aria]');
    ariaLabels.forEach((el) => {
        const key = el.getAttribute('data-i18n-aria');
        if (key) {
            el.setAttribute('aria-label', t(key));
        }
    });
}
