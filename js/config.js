// ✅ APP CONFIGURATION
export const CONFIG = {
    // Exchange rates
    EXCHANGE_RATES: {
        USD_TO_VND: 26450,
        VND_TO_USD: 1 / 26450
    },
    
    // Default values
    DEFAULTS: {
        INCOME: 5200,
        NEEDS_PERCENT: 50,
        WANTS_PERCENT: 30,
        SAVINGS_PERCENT: 20,
        CURRENCY: 'USD'
    },
    
    // Debounce timings (ms)
    DEBOUNCE: {
        SEARCH: 300,
        BUDGET_SAVE: 500
    },
    
    // Local storage keys
    STORAGE_KEYS: {
        CURRENCY: 'currency',
        INCOME: 'income',
        EXPENSES: 'expenses',
        BUDGETS: 'monthlyBudgets'
    },
    
    // Firebase collections
    COLLECTIONS: {
        USERS: 'users',
        EXPENSES: 'expenses'
    }
};
