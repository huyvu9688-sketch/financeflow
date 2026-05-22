import { CONFIG } from './config.js';

// ✅ DOM UTILITIES
export function showSync() { 
    const i = document.getElementById('sync-indicator'); 
    if(i) i.classList.add('show'); 
}

export function hideSync() { 
    const i = document.getElementById('sync-indicator'); 
    if(i) i.classList.remove('show'); 
}

// ✅ FORMATTING UTILITIES
export function formatNumber(num, currency = 'USD') { 
    return currency === 'VND' 
        ? new Intl.NumberFormat('vi-VN').format(num) 
        : new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num); 
}

export function formatCurrency(amount, currency = 'USD') { 
    return currency === 'VND' 
        ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount) 
        : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount); 
}

// ✅ CURRENCY CONVERSION (uses CONFIG)
export function convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amount;
    
    if (fromCurrency === 'USD' && toCurrency === 'VND') {
        return amount * CONFIG.EXCHANGE_RATES.USD_TO_VND;
    } else if (fromCurrency === 'VND' && toCurrency === 'USD') {
        return amount * CONFIG.EXCHANGE_RATES.VND_TO_USD;
    }
    return amount;
}

// ✅ DATE UTILITIES
export function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-');
    const date = new Date(year, month - 1);
    const monthName = date.toLocaleString('default', { month: 'short' });
    return `${monthName} ${year}`;
}

export function getDaysRemainingInMonth(year, month) {
    const lastDay = new Date(year, month + 1, 0);
    const now = new Date();
    if (year === now.getFullYear() && month === now.getMonth()) {
        return lastDay.getDate() - now.getDate() + 1;
    }
    return lastDay.getDate();
}

// ✅ VALIDATION UTILITIES
export function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

export function validateAmount(amount) {
    return !isNaN(amount) && amount > 0;
}

export function validatePercentage(value) {
    const num = parseInt(value);
    return !isNaN(num) && num >= 0 && num <= 100;
}

// ✅ STORAGE UTILITIES
export function getFromLocalStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.error('Error reading from localStorage:', e);
        return defaultValue;
    }
}

export function saveToLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error('Error saving to localStorage:', e);
        return false;
    }
}

// ✅ DEBOUNCE UTILITY
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ✅ ESCAPE HTML (prevent XSS)
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// At the end of utils.js, add:
if (typeof window !== 'undefined') {
    window.convertCurrency = convertCurrency;
}

