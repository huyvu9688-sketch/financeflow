import { setupAuth } from './auth.js';
import { Database } from './database.js';
import { init3DBackground } from './background-3d.js';
import { ExpenseTracker } from './expense-tracker.js';
import { BudgetPlanner } from './budget-planner.js';

// --- STATE ---
let currentUser = null;
let currentCurrency = localStorage.getItem('currency') || 'USD';
const EXCHANGE_RATE = 25450;
let expensesCache = [];

// --- UTILS ---
function showSync() { 
    const i = document.getElementById('sync-indicator'); 
    if(i) i.classList.add('show'); 
}

function hideSync() { 
    const i = document.getElementById('sync-indicator'); 
    if(i) i.classList.remove('show'); 
}

function formatNumber(num) { 
    return currentCurrency === 'VND' 
        ? new Intl.NumberFormat('vi-VN').format(num) 
        : new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num); 
}

function formatCurrency(amount) { 
    return currentCurrency === 'VND' 
        ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount) 
        : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount); 
}

function getUserIncome() {
    return currentUser 
        ? (parseFloat(localStorage.getItem(`income_${currentUser.uid}`)) || 5200) 
        : (parseFloat(localStorage.getItem('income')) || 5200);
}

function convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amount;
    
    if (fromCurrency === 'USD' && toCurrency === 'VND') {
        return amount * EXCHANGE_RATE;
    } else if (fromCurrency === 'VND' && toCurrency === 'USD') {
        return amount / EXCHANGE_RATE;
    }
    return amount;
}

function getCategoryLabel(cat) {
    const map = {
        'housing': 'Housing',
        'food': 'Food & Dining',
        'transportation': 'Transportation',
        'entertainment': 'Entertainment',
        'healthcare': 'Healthcare',
        'shopping': 'Shopping',
        'utilities': 'Utilities',
        'other': 'Other'
    };
    return map[cat] || 'Other';
}

// ✅ NEW: Fixed color mapping per category (matches donut chart pastel colors)
function getCategoryColor(category) {
    const colorMap = {
        'housing': 'hsl(0, 70%, 75%)',      // Red pastel
        'food': 'hsl(51, 70%, 75%)',        // Yellow pastel
        'transportation': 'hsl(102, 70%, 75%)', // Green pastel
        'entertainment': 'hsl(153, 70%, 75%)',  // Cyan pastel
        'healthcare': 'hsl(204, 70%, 75%)',     // Blue pastel
        'shopping': 'hsl(255, 70%, 75%)',       // Purple pastel
        'utilities': 'hsl(306, 70%, 75%)',      // Magenta pastel
        'other': 'hsl(0, 0%, 60%)'              // Gray
    };
    
    return colorMap[category.toLowerCase()] || 'hsl(0, 0%, 60%)';
}

// ✅ NEW: Reverse mapping helper
function getCategoryKey(displayLabel) {
    const reverseMap = {
        'Housing': 'housing',
        'Food & Dining': 'food',
        'Transportation': 'transportation',
        'Entertainment': 'entertainment',
        'Healthcare': 'healthcare',
        'Shopping': 'shopping',
        'Utilities': 'utilities',
        'Other': 'other'
    };
    return reverseMap[displayLabel] || 'other';
}

// --- DATA LOGIC ---
async function loadAndRenderData() {
    if (!currentUser) return;
    showSync();
    try {
        const data = await Database.loadUserData(currentUser.uid);
        expensesCache = data.expenses || [];
        localStorage.setItem(`expenses_${currentUser.uid}`, JSON.stringify(expensesCache));
        
        if (data.budget) {
            const needsInput = document.getElementById('input-needs');
            const wantsInput = document.getElementById('input-wants');
            const savingsInput = document.getElementById('input-savings');
            
            if(needsInput) needsInput.value = data.budget.needs || 50;
            if(wantsInput) wantsInput.value = data.budget.wants || 30;
            if(savingsInput) savingsInput.value = data.budget.savings || 20;
            
            const income = data.budget.income || 5200;
            const incomeInput = document.getElementById('income-input');
            if(incomeInput) {
                incomeInput.dataset.value = income;
                incomeInput.value = formatNumber(income);
            }
            
            localStorage.setItem(`income_${currentUser.uid}`, income);
        }

        if (data.currency) {
            currentCurrency = data.currency;
            localStorage.setItem(`currency_${currentUser.uid}`, data.currency);
            updateCurrencyUI(data.currency);
        }
        
        if (BudgetPlanner.setFunds) BudgetPlanner.setFunds(data.sinkingFunds || []);
        if (BudgetPlanner.setSimulatedData) BudgetPlanner.setSimulatedData(data.fundAllocations || {});
        
        updateBudgetAllocation();
        
        if (ExpenseTracker.update) ExpenseTracker.update(); 
        if (BudgetPlanner.renderFundsList) BudgetPlanner.renderFundsList();
        if (BudgetPlanner.updateSavingsGoalBox) BudgetPlanner.updateSavingsGoalBox();
        
        updateMonthlyChart();
        updateSettingsUI();
        
    } catch (e) {
        console.error("Error loading user data:", e);
    } finally {
        hideSync();
    }
}

function updateCurrencyUI(currency) {
    const curLabel = document.getElementById('current-currency-label');
    if(curLabel) curLabel.innerHTML = `${currency} <iconify-icon icon="solar:alt-arrow-down-linear" class="text-[10px]"></iconify-icon>`;
    
    const settingsCurrencySelect = document.getElementById('settings-currency-select');
    if(settingsCurrencySelect) settingsCurrencySelect.value = currency;
    
    const expAmount = document.getElementById('expense-amount');
    if(expAmount) {
        expAmount.placeholder = currency === 'USD' ? '0.00' : '0';
        expAmount.step = currency === 'USD' ? '0.01' : '1';
    }
}

function updateSettingsUI() {
    if(!currentUser) return;
    
    const settingsAvatar = document.getElementById('settings-user-avatar');
    const settingsName = document.getElementById('settings-user-name');
    const menuAvatar = document.getElementById('menu-user-avatar');
    const menuName = document.getElementById('menu-user-name');
    const menuEmail = document.getElementById('menu-user-email');
    const currentAvatar = document.getElementById('current-user-avatar');
    const currentName = document.getElementById('current-user-name');
    
    const photoURL = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || currentUser.email)}&background=10b981&color=fff`;
    const displayName = currentUser.displayName || currentUser.email.split('@')[0];
    
    if(settingsAvatar) settingsAvatar.src = photoURL;
    if(settingsName) settingsName.textContent = displayName;
    if(menuAvatar) menuAvatar.src = photoURL;
    if(menuName) menuName.textContent = displayName;
    if(menuEmail) menuEmail.textContent = currentUser.email;
    if(currentAvatar) currentAvatar.src = photoURL;
    if(currentName) currentName.textContent = displayName;
}

function updateBudgetAllocation() {
    const needsInput = document.getElementById('input-needs');
    const wantsInput = document.getElementById('input-wants');
    const savingsInput = document.getElementById('input-savings');
    
    if(!needsInput || !wantsInput || !savingsInput) return;

    const needs = parseInt(needsInput.value);
    const wants = parseInt(wantsInput.value);
    const savings = parseInt(savingsInput.value);
    const total = needs + wants + savings;
    
    document.getElementById('val-needs').value = needs + '%';
    document.getElementById('val-wants').value = wants + '%';
    document.getElementById('val-savings').value = savings + '%';
    
    const totalPercentage = document.getElementById('total-percentage');
    if(totalPercentage) {
        totalPercentage.textContent = total + '%';
        totalPercentage.style.color = total === 100 ? '#10b981' : (total < 100 ? '#f59e0b' : '#ef4444');
    }
    
    if (window.uniforms) window.uniforms.uDistortion.value = needs / 100;
    
    const incomeInput = document.getElementById('income-input');
    let baseIncome = parseFloat(incomeInput.dataset.value) || 0;
    const storedCurrency = incomeInput.dataset.currency || 'USD';
    
    let displayIncome = baseIncome;
    if (storedCurrency !== currentCurrency) {
        displayIncome = convertCurrency(baseIncome, storedCurrency, currentCurrency);
    }
    
    const aNeeds = document.getElementById('amount-needs');
    const aWants = document.getElementById('amount-wants');
    const aSavings = document.getElementById('amount-savings');
    
    if(aNeeds) aNeeds.textContent = formatCurrency(displayIncome * needs / 100);
    if(aWants) aWants.textContent = formatCurrency(displayIncome * wants / 100);
    if(aSavings) aSavings.textContent = formatCurrency(displayIncome * savings / 100);

    if (currentUser) {
        Database.saveBudget(currentUser.uid, { needs, wants, savings, income: baseIncome }, storedCurrency);
    }
    
    if (BudgetPlanner.updateSavingsGoalBox) {
        BudgetPlanner.updateSavingsGoalBox();
    }
}

// --- MONTHLY CHART FUNCTIONS ---
function calculateMonthlyData(expenses, year) {
    const categories = ['Housing', 'Food & Dining', 'Transportation', 'Entertainment', 'Healthcare', 'Shopping', 'Utilities', 'Other'];
    
    const data = {};
    categories.forEach(cat => {
        data[cat] = Array(12).fill(0);
    });
    
    expenses.forEach(exp => {
        const date = new Date(exp.date);
        if (date.getFullYear().toString() !== year) return;
        
        const monthIndex = date.getMonth();
        const category = getCategoryLabel(exp.category);
        
        if (data[category]) {
            let amount = exp.amount;
            const expenseCurrency = exp.currency || 'USD';
            
            if (expenseCurrency !== currentCurrency) {
                amount = convertCurrency(amount, expenseCurrency, currentCurrency);
            }
            
            data[category][monthIndex] += amount;
        }
    });
    
    return data;
}

function updateMonthlyChart(year = null) {
    if (!window.monthlyStackedChart) return;
    
    const selectedYear = year || document.getElementById('analytics-year-picker')?.value || new Date().getFullYear().toString();
    
    const chartData = calculateMonthlyData(expensesCache, selectedYear);
    
    // ✅ Calculate monthly income data
    const getMonthlyIncomeData = () => {
        const incomeInput = document.getElementById('income-input');
        const baseIncome = incomeInput ? (parseFloat(incomeInput.dataset.value) || 5200) : 5200;
        const storedCurrency = incomeInput ? (incomeInput.dataset.currency || 'USD') : 'USD';
        
        let displayIncome = baseIncome;
        if (storedCurrency !== currentCurrency) {
            if (storedCurrency === 'USD' && currentCurrency === 'VND') {
                displayIncome = baseIncome * EXCHANGE_RATE;
            } else if (storedCurrency === 'VND' && currentCurrency === 'USD') {
                displayIncome = baseIncome / EXCHANGE_RATE;
            }
        }
        
        const incomeData = [];
        
        for (let month = 0; month < 12; month++) {
            // Check if this month has any expense data
            let hasData = false;
            Object.values(chartData).forEach(monthlyData => {
                if (monthlyData[month] > 0) {
                    hasData = true;
                }
            });
            
            // ✅ ONLY show income if the month actually has expense data
            // (Removes the past/future month logic so past empty months are also hidden)
            if (hasData) {
                incomeData.push(displayIncome);
            } else {
                incomeData.push(null); // Creates a gap / hides the dot
            }
        }
        
        return incomeData;
    };
    
    const monthlyIncomeData = getMonthlyIncomeData();
    
    // Calculate yearly totals for ordering
    const categoryYearlyTotals = {};
    window.monthlyStackedChart.data.datasets.forEach(dataset => {
        if (dataset.label === 'Monthly Income') return; // Skip income line
        
        const total = chartData[dataset.label] 
            ? chartData[dataset.label].reduce((sum, val) => sum + val, 0)
            : 0;
        categoryYearlyTotals[dataset.label] = total;
    });
    
    // Sort to get order (highest first = bottom of visual stack)
    const sortedLabels = Object.keys(categoryYearlyTotals)
        .sort((a, b) => categoryYearlyTotals[b] - categoryYearlyTotals[a]);
    
    // Update data and set order property
    window.monthlyStackedChart.data.datasets.forEach((dataset) => {
        // Update income line
        if (dataset.label === 'Monthly Income') {
            dataset.data = monthlyIncomeData;
            dataset.order = 1; // Always on top
            return;
        }
        
        // Update expense bar data
        if (chartData[dataset.label]) {
            dataset.data = chartData[dataset.label];
        } else {
            dataset.data = Array(12).fill(0);
        }
        
        // Set drawing order
        dataset.order = sortedLabels.indexOf(dataset.label) + 2; // +2 to keep bars behind line
        
        // Ensure border properties are maintained
        dataset.borderColor = '#000000';
        dataset.borderWidth = 1.5;
    });
    
    window.monthlyStackedChart.options.scales.y.min = undefined;
    window.monthlyStackedChart.options.scales.y.max = undefined;
    
    window.monthlyStackedChart.options.scales.y.ticks.callback = function(value) {
        const currency = currentCurrency || localStorage.getItem('currency') || 'USD';
        
        if (currency === 'VND') {
            if (value >= 1000000) return (value / 1000000) + 'M₫';
            else if (value >= 1000) return (value / 1000) + 'K₫';
            else return value + '₫';
        } else {
            if (value >= 1000) return '$' + (value / 1000) + 'k';
            else return '$' + value;
        }
    };
    
    window.currentCurrency = currentCurrency;
    
    window.monthlyStackedChart.update('none');
    
    updateChartStats(chartData, selectedYear);
}

function updateChartStats(chartData, year) {
    let yearTotal = 0;
    Object.values(chartData).forEach(monthlyData => {
        yearTotal += monthlyData.reduce((sum, val) => sum + val, 0);
    });
    
    const yearTotalEl = document.getElementById('year-total');
    const yearTotalLabel = document.getElementById('year-total-label');
    if(yearTotalEl) yearTotalEl.textContent = formatCurrency(yearTotal);
    if(yearTotalLabel) yearTotalLabel.textContent = `Total spending in ${year}`;
    
    let topCategory = '';
    let topAmount = 0;
    Object.entries(chartData).forEach(([cat, data]) => {
        const total = data.reduce((sum, val) => sum + val, 0);
        if (total > topAmount) {
            topAmount = total;
            topCategory = cat;
        }
    });
    
    const topCatEl = document.getElementById('top-category');
    const topCatAmountEl = document.getElementById('top-category-amount');
    const topCatBarEl = document.getElementById('top-category-bar');
    
    if(topCatEl) topCatEl.textContent = topCategory || 'N/A';
    if(topCatAmountEl && yearTotal > 0) {
        const percent = Math.round((topAmount / yearTotal) * 100);
        topCatAmountEl.textContent = `${formatCurrency(topAmount)} (${percent}%)`;
        if(topCatBarEl) topCatBarEl.style.width = `${percent}%`;
    } else if(topCatAmountEl) {
        topCatAmountEl.textContent = `${formatCurrency(0)} (0%)`;
        if(topCatBarEl) topCatBarEl.style.width = '0%';
    }
    
    const monthlyTotals = Array(12).fill(0);
    Object.values(chartData).forEach(data => {
        data.forEach((val, i) => monthlyTotals[i] += val);
    });
    
    const nonZeroMonths = monthlyTotals.filter(v => v > 0);
    if (nonZeroMonths.length === 0) {
        const highestMonthEl = document.getElementById('highest-month');
        const highestAmountEl = document.getElementById('highest-amount');
        const lowestMonthEl = document.getElementById('lowest-month');
        const lowestAmountEl = document.getElementById('lowest-amount');
        
        if(highestMonthEl) highestMonthEl.textContent = 'N/A';
        if(highestAmountEl) highestAmountEl.textContent = formatCurrency(0);
        if(lowestMonthEl) lowestMonthEl.textContent = 'N/A';
        if(lowestAmountEl) lowestAmountEl.textContent = formatCurrency(0);
    } else {
        const maxMonth = monthlyTotals.indexOf(Math.max(...monthlyTotals));
        const minMonth = monthlyTotals.indexOf(Math.min(...nonZeroMonths));
        
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        
        const highestMonthEl = document.getElementById('highest-month');
        const highestAmountEl = document.getElementById('highest-amount');
        const lowestMonthEl = document.getElementById('lowest-month');
        const lowestAmountEl = document.getElementById('lowest-amount');
        
        if(highestMonthEl) highestMonthEl.textContent = months[maxMonth];
        if(highestAmountEl) highestAmountEl.textContent = formatCurrency(monthlyTotals[maxMonth]);
        if(lowestMonthEl) lowestMonthEl.textContent = months[minMonth];
        if(lowestAmountEl) lowestAmountEl.textContent = formatCurrency(monthlyTotals[minMonth]);
    }
    
    const annualBudget = getUserIncome() * 12;
    const runningTotal = yearTotal;
    const remaining = annualBudget - runningTotal;
    
    const runningTotalEl = document.getElementById('running-total');
    const annualBudgetEl = document.getElementById('annual-budget');
    const budgetRemainingEl = document.getElementById('budget-remaining');
    const budgetProgressBar = document.getElementById('budget-progress-bar');
    
    if(runningTotalEl) runningTotalEl.textContent = formatCurrency(runningTotal);
    if(annualBudgetEl) annualBudgetEl.textContent = formatCurrency(annualBudget);
    if(budgetRemainingEl) budgetRemainingEl.textContent = formatCurrency(Math.max(0, remaining));
    if(budgetProgressBar && annualBudget > 0) {
        const percent = Math.min(100, Math.round((runningTotal / annualBudget) * 100));
        budgetProgressBar.style.width = `${percent}%`;
    }
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    
    const coreAPI = {
        getUser: () => currentUser,
        getExpenses: () => expensesCache,
        setExpenses: (newExpenses) => { 
            expensesCache = newExpenses; 
            if(currentUser) localStorage.setItem(`expenses_${currentUser.uid}`, JSON.stringify(expensesCache));
        },
        getIncome: getUserIncome,
        getCurrency: () => currentCurrency,
        formatCurrency: formatCurrency,
        formatNumber: formatNumber,
        showSync: showSync,
        hideSync: hideSync
    };

    try { ExpenseTracker.init(coreAPI); } catch(e) { console.error("ExpenseTracker init failed", e); }
    try { BudgetPlanner.init(coreAPI); } catch(e) { console.error("BudgetPlanner init failed", e); }
    try { init3DBackground(); } catch(e) { console.error("3D init failed", e); }

    setupAuth({
        onLogin: (user) => { 
            currentUser = user; 
            loadAndRenderData();
            updateSettingsUI();
        },
        onLogout: () => { 
            currentUser = null; 
            expensesCache = []; 
            if (ExpenseTracker.update) ExpenseTracker.update(); 
            
            if (BudgetPlanner.setFunds) BudgetPlanner.setFunds([]);
            if (BudgetPlanner.setSimulatedData) BudgetPlanner.setSimulatedData({});
            if (BudgetPlanner.renderFundsList) BudgetPlanner.renderFundsList();
            if (window.budgetChart) {
                window.budgetChart.destroy();
                window.budgetChart = null;
            }
            
            updateMonthlyChart();
        }
    });

    const expForm = document.getElementById('expense-form');
    if(expForm) {
        expForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!currentUser) return alert('Please login to save expenses');
            
            const amount = parseFloat(document.getElementById('expense-amount').value);
            
            const expense = {
                date: document.getElementById('expense-date').value,
                name: document.getElementById('expense-name').value,
                category: document.getElementById('expense-category').value,
                amount: amount,
                currency: currentCurrency
            };
            
            showSync();
            const id = await Database.saveExpense(currentUser.uid, expense, currentCurrency);
            expensesCache.unshift({ id, ...expense });
            localStorage.setItem(`expenses_${currentUser.uid}`, JSON.stringify(expensesCache));
            hideSync();
            
            if (ExpenseTracker.update) ExpenseTracker.update();
            updateMonthlyChart();
            
            e.target.reset();
            document.getElementById('expense-date').valueAsDate = new Date();
        });
    }

    document.querySelectorAll('.currency-selector').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const newCur = e.target.closest('button').dataset.currency;
            if (newCur === currentCurrency) return;
            
            const oldCurrency = currentCurrency;
            currentCurrency = newCur;
            window.currentCurrency = newCur;
            if(currentUser) localStorage.setItem(`currency_${currentUser.uid}`, newCur);
            
            updateCurrencyUI(newCur);
            
            const incomeInput = document.getElementById('income-input');
            if (incomeInput) {
                const storedCurrency = incomeInput.dataset.currency || oldCurrency;
                let baseIncome = parseFloat(incomeInput.dataset.value) || 0;
                
                let displayIncome = baseIncome;
                if (storedCurrency !== currentCurrency) {
                    displayIncome = convertCurrency(baseIncome, storedCurrency, currentCurrency);
                }
                
                incomeInput.value = formatNumber(displayIncome);
            }
            
            updateBudgetAllocation();
            
            if (ExpenseTracker.update) ExpenseTracker.update();
            if (BudgetPlanner.renderFundsList) BudgetPlanner.renderFundsList();
            if (BudgetPlanner.updateSavingsGoalBox) BudgetPlanner.updateSavingsGoalBox();
            
            updateMonthlyChart();
            
            const modal = document.getElementById('budget-modal');
            if (modal && modal.classList.contains('active') && window.budgetChart) {
                const activeFund = document.querySelector('.cf-item.border-emerald-500\\/50');
                if (activeFund) activeFund.click();
            }
        });
    });

    const settingsCurrencySelect = document.getElementById('settings-currency-select');
    if(settingsCurrencySelect) {
        settingsCurrencySelect.value = currentCurrency;
        settingsCurrencySelect.addEventListener('change', (e) => {
            const newCur = e.target.value;
            const currencyBtn = document.querySelector(`.currency-selector[data-currency="${newCur}"]`);
            if(currencyBtn) currencyBtn.click();
        });
    }

    const incInput = document.getElementById('income-input');
    if(incInput) {
        if (!incInput.dataset.currency) {
            incInput.dataset.currency = currentCurrency;
        }
        
        incInput.addEventListener('focus', function() { 
            const storedCurrency = this.dataset.currency || 'USD';
            let baseValue = parseFloat(this.dataset.value) || 0;
            
            if (storedCurrency !== currentCurrency) {
                baseValue = convertCurrency(baseValue, storedCurrency, currentCurrency);
            }
            
            this.value = baseValue;
        });
        
        incInput.addEventListener('blur', function() {
            let val = parseFloat(this.value) || 0;
            
            this.dataset.value = val;
            this.dataset.currency = currentCurrency;
            
            if(currentUser) {
                localStorage.setItem(`income_${currentUser.uid}`, val);
                localStorage.setItem(`income_currency_${currentUser.uid}`, currentCurrency);
            }
            
            this.value = formatNumber(val);
            updateBudgetAllocation();
            
            // ✅ Update chart when income changes
            updateMonthlyChart();
        });
        
        const storedCurrency = incInput.dataset.currency || 'USD';
        let displayValue = parseFloat(incInput.dataset.value) || 0;
        if (storedCurrency !== currentCurrency) {
            displayValue = convertCurrency(displayValue, storedCurrency, currentCurrency);
        }
        incInput.value = formatNumber(displayValue);
    }

    ['needs', 'wants', 'savings'].forEach(type => {
        const slider = document.getElementById(`input-${type}`);
        const input = document.getElementById(`val-${type}`);
        if(slider && input) {
            slider.addEventListener('input', () => {
                updateBudgetAllocation();
            });
            input.addEventListener('blur', function() {
                let val = Math.max(0, Math.min(100, parseInt(this.value.replace('%','')) || 0));
                this.value = val + '%'; 
                slider.value = val; 
                updateBudgetAllocation();
            });
        }
    });

    const exportBtn = document.getElementById('export-data-btn');
    if(exportBtn) {
        exportBtn.addEventListener('click', () => {
            if(!currentUser) return alert('Please login first');
            
            const exportData = {
                user: currentUser.email,
                currency: currentCurrency,
                income: getUserIncome(),
                expenses: expensesCache,
                budget: {
                    needs: parseInt(document.getElementById('input-needs').value),
                    wants: parseInt(document.getElementById('input-wants').value),
                    savings: parseInt(document.getElementById('input-savings').value)
                },
                exportedAt: new Date().toISOString()
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `financeflow-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    const settingsLogoutBtn = document.getElementById('settings-logout-btn');
    if(settingsLogoutBtn) {
        settingsLogoutBtn.addEventListener('click', () => {
            document.getElementById('logout-btn')?.click();
            document.getElementById('settings-modal')?.classList.remove('active');
        });
    }

    const openSettingsBtn = document.getElementById('open-settings-btn');
    if(openSettingsBtn) {
        openSettingsBtn.addEventListener('click', () => {
            document.getElementById('settings-modal')?.classList.add('active');
        });
    }

    const closeSettingsBtn = document.getElementById('close-settings-btn');
    if(closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            document.getElementById('settings-modal')?.classList.remove('active');
        });
    }

    const expDate = document.getElementById('expense-date');
    if(expDate) expDate.valueAsDate = new Date();
    
    updateBudgetAllocation();

    document.addEventListener('keydown', (e) => {
        const expenseModal = document.getElementById('expense-modal');
        const budgetModal = document.getElementById('budget-modal');
        const settingsModal = document.getElementById('settings-modal');
        
        if (e.key === 'Escape') {
            const editingRow = document.querySelector('.expense-history-item.editing');
            if (editingRow) {
                if(ExpenseTracker.update) ExpenseTracker.update(); 
            } else {
                if (expenseModal && expenseModal.classList.contains('active')) {
                    expenseModal.classList.remove('active');
                    document.body.style.overflow = 'auto';
                }
                if (budgetModal && budgetModal.classList.contains('active')) {
                    budgetModal.classList.remove('active');
                    document.body.style.overflow = 'auto';
                    if(window.budgetChart) {
                        window.budgetChart.destroy();
                        window.budgetChart = null;
                    }
                    if(BudgetPlanner.resetSimUI) BudgetPlanner.resetSimUI();
                }
                if (settingsModal && settingsModal.classList.contains('active')) {
                    settingsModal.classList.remove('active');
                }
            }
        }
        
        if (e.key === 'Enter') {
            const editingRow = e.target.closest('.expense-history-item.editing');
            if (editingRow && ExpenseTracker.toggleEdit) {
                e.preventDefault();
                const id = editingRow.getAttribute('data-id');
                ExpenseTracker.toggleEdit(id);
            }
        }

        if (e.altKey && e.key.toLowerCase() === 'm') {
            e.preventDefault();
            if(expenseModal) {
                expenseModal.classList.add('active');
                document.body.style.overflow = 'hidden';
                if(ExpenseTracker.update) ExpenseTracker.update();
            }
        }

        if (e.altKey && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            if (expenseModal && expenseModal.classList.contains('active')) {
                expenseModal.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
            if (budgetModal && budgetModal.classList.contains('active')) {
                budgetModal.classList.remove('active');
                document.body.style.overflow = 'auto';
                if(window.budgetChart) {
                    window.budgetChart.destroy();
                    window.budgetChart = null;
                }
            }
            const expName = document.getElementById('expense-name');
            if(expName) expName.focus();
        }
    });
});
