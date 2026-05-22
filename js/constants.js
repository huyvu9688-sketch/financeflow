// ✅ EXPENSE CATEGORIES
// Each category has: value (for DB), label (for display), color (for charts)
export const EXPENSE_CATEGORIES = [
    { 
        value: 'housing', 
        label: 'Housing', 
        color: 'hsl(0, 70%, 75%)',
        budgetType: 'needs'
    },
    { 
        value: 'food', 
        label: 'Food & Dining', 
        color: 'hsl(51, 70%, 75%)',
        budgetType: 'needs'
    },
    { 
        value: 'transportation', 
        label: 'Transportation', 
        color: 'hsl(102, 70%, 75%)',
        budgetType: 'needs'
    },
    { 
        value: 'entertainment', 
        label: 'Entertainment', 
        color: 'hsl(153, 70%, 75%)',
        budgetType: 'wants'
    },
    { 
        value: 'healthcare', 
        label: 'Healthcare', 
        color: 'hsl(204, 70%, 75%)',
        budgetType: 'needs'
    },
    { 
        value: 'shopping', 
        label: 'Shopping', 
        color: 'hsl(255, 70%, 75%)',
        budgetType: 'wants'
    },
    { 
        value: 'utilities', 
        label: 'Utilities', 
        color: 'hsl(306, 70%, 75%)',
        budgetType: 'needs'
    },
    { 
        value: 'other', 
        label: 'Other', 
        color: 'hsl(0, 0%, 60%)',
        budgetType: 'wants'
    },
];

// ✅ HELPER FUNCTIONS
export function getCategoryLabel(value) {
    const category = EXPENSE_CATEGORIES.find(cat => cat.value === value.toLowerCase());
    return category ? category.label : 'Other';
}

export function getCategoryColor(value) {
    const category = EXPENSE_CATEGORIES.find(cat => cat.value === value.toLowerCase());
    return category ? category.color : 'hsl(0, 0%, 60%)';
}

export function getCategoryValue(label) {
    const category = EXPENSE_CATEGORIES.find(cat => cat.label === label);
    return category ? category.value : 'other';
}

export function getCategoryBudgetType(value) {
    const category = EXPENSE_CATEGORIES.find(cat => cat.value === value.toLowerCase());
    return category ? category.budgetType : 'wants';
}

// ✅ Get just the labels (for chart axes, etc.)
export function getCategoryLabels() {
    return EXPENSE_CATEGORIES.map(cat => cat.label);
}

// ✅ Generate HTML options for <select> dropdown
export function getCategoryOptions(selectedValue = '') {
    return EXPENSE_CATEGORIES.map(cat => 
        `<option value="${cat.value}" ${selectedValue === cat.value ? 'selected' : ''}>${cat.label}</option>`
    ).join('');
}
