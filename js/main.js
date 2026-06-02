// main.js
import { setupAuth } from './auth.js';
import { Database } from './database.js';
import { init3DBackground } from './background-3d.js';
import { ExpenseTracker } from './expense-tracker.js';
import { BudgetPlanner } from './budget-planner.js';
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, deleteField } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getCategoryLabel, getCategoryLabels, getCategoryOptions } from './constants.js';
import { 
    showSync, 
    hideSync, 
    formatNumber, 
    formatCurrency, 
    convertCurrency,
    getCurrentMonthKey as utilGetCurrentMonthKey,
    formatMonthLabel
} from './utils.js';
import { 
    showToast, 
    showSuccessToast, 
    showErrorToast, 
    showWarningToast,
    showInfoToast,
    showConfirm,
    showLoading,
    hideLoading
} from './notifications.js';

// Make convertCurrency globally available for budget-planner
if (typeof window !== 'undefined') {
    window.convertCurrency = convertCurrency;
}

// ===================================
// STATE MANAGEMENT
// ===================================
let currentUser = null;
let currentCurrency = localStorage.getItem('currency') || 'USD';
let expensesCache = [];
let monthlyBudgetsCache = {};
let currentBudgetMonth = null;

// ✅ NEW: Month index for fast lookups
let expensesByMonth = {};

// ===================================
// MONTH INDEX BUILDER
// ===================================
function buildExpenseIndex() {
    expensesByMonth = {};
    
    expensesCache.forEach(exp => {
        const date = new Date(exp.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!expensesByMonth[monthKey]) {
            expensesByMonth[monthKey] = [];
        }
        
        expensesByMonth[monthKey].push(exp);
    });
    
    console.log('📊 Expense index built:', Object.keys(expensesByMonth).length, 'months');
}

// ===================================
// UTILITY FUNCTIONS
// ===================================
function getCurrentMonthKey() {
    if (!currentBudgetMonth) {
        currentBudgetMonth = utilGetCurrentMonthKey();
    }
    return currentBudgetMonth;
}

function getUserIncome() {
    if (!currentUser) {
        return parseFloat(localStorage.getItem('income')) || 5200;
    }
    
    // ✅ Use the selected month from budget picker
    const budgetMonthPicker = document.getElementById('budget-month-picker');
    const targetMonth = budgetMonthPicker ? budgetMonthPicker.value : getCurrentMonthKey();
    
    const monthBudget = monthlyBudgetsCache[targetMonth];
    
    if (monthBudget && monthBudget.income !== undefined) {
        console.log('📥 getUserIncome() returning:', monthBudget.income, 'for month:', targetMonth);
        return monthBudget.income;
    }
    
    // ✅ Fallback: Check localStorage for this user
    const storedIncome = parseFloat(localStorage.getItem(`income_${currentUser.uid}`));
    if (storedIncome) {
        console.log('📥 getUserIncome() fallback to localStorage:', storedIncome);
        return storedIncome;
    }
    
    console.warn('⚠️ getUserIncome() using default 5200 for month:', targetMonth);
    return 5200;
}

// ===================================
// BUDGET MANAGEMENT
// ===================================
function loadMonthBudget(monthKey) {
    const monthBudget = monthlyBudgetsCache[monthKey];
    
    let budgetToUse;
    
    if (!monthBudget) {
        console.warn('⚠️ No budget found for', monthKey, '- creating default');
        budgetToUse = {
            needs: 50,
            wants: 30,
            savings: 20,
            income: 5200,
            currency: currentCurrency
        };
        // ✅ Save default budget
        monthlyBudgetsCache[monthKey] = budgetToUse;
        
        if (currentUser) {
            Database.saveMonthlyBudget(currentUser.uid, monthKey, budgetToUse, currentCurrency);
        }
    } else {
        console.log('✅ Found budget for', monthKey, ':', monthBudget);
        budgetToUse = monthBudget;
    }
    
    const needsInput = document.getElementById('input-needs');
    const wantsInput = document.getElementById('input-wants');
    const savingsInput = document.getElementById('input-savings');
    const incomeInput = document.getElementById('income-input');
    
    if(needsInput) needsInput.value = budgetToUse.needs;
    if(wantsInput) wantsInput.value = budgetToUse.wants;
    if(savingsInput) savingsInput.value = budgetToUse.savings;
    
    if(incomeInput) {
        const storedCurrency = budgetToUse.currency || currentCurrency;
        
        // ✅ FIX: Always use the base value, don't convert
        incomeInput.dataset.value = budgetToUse.income;
        incomeInput.dataset.currency = storedCurrency;
        
        // ✅ Display the value in the stored currency (no conversion)
        incomeInput.value = formatNumber(budgetToUse.income, storedCurrency);
        
        console.log('💰 Income loaded for', monthKey, ':', budgetToUse.income, storedCurrency);
    }
    
    currentBudgetMonth = monthKey;
    updateBudgetAllocation();
}

// ===================================
// DATA LOADING & MIGRATION
// ===================================
async function loadAndRenderData() {
    if (!currentUser) return;
    showSync();
    try {
        const data = await Database.loadUserData(currentUser.uid);
        
        console.log('📊 Loaded data:', {
            expenses: data.expenses?.length || 0,
            monthlyBudgets: Object.keys(data.monthlyBudgets || {}).length,
            currency: data.currency
        });
        
        expensesCache = data.expenses || [];
        monthlyBudgetsCache = data.monthlyBudgets || {};
        
        // ✅ Build expense index after loading
        buildExpenseIndex();
        
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const currentMigrationVersion = userDoc.exists() ? (userDoc.data().migrationVersion || 0) : 0;
        
        // ✅ MIGRATION VERSION 1: Old budget → monthlyBudgets
        if (currentMigrationVersion < 1) {
            if (userDoc.exists() && userDoc.data().budget) {
                const oldBudget = userDoc.data().budget;
                const currentMonth = getCurrentMonthKey();
                
                monthlyBudgetsCache[currentMonth] = {
                    ...oldBudget,
                    currency: data.currency || 'USD'
                };
                
                console.log('✅ Migration v1: Converting old budget format...');
                
                await setDoc(doc(db, 'users', currentUser.uid), {
                    monthlyBudgets: { [currentMonth]: monthlyBudgetsCache[currentMonth] },
                    budget: deleteField(),
                    migrationVersion: 1
                }, { merge: true });
                
                showSuccessToast('Budget data updated to new format');
            } else {
                await setDoc(doc(db, 'users', currentUser.uid), {
                    migrationVersion: 1
                }, { merge: true });
            }
        }
        
        // ✅ MIGRATION VERSION 2: Add currency field to expenses
        if (currentMigrationVersion < 2) {
            const userCurrency = data.currency || 'USD';
            let needsExpenseMigration = false;
            
            expensesCache.forEach(exp => {
                if (!exp.currency) {
                    exp.currency = userCurrency;
                    needsExpenseMigration = true;
                }
            });
            
            if (needsExpenseMigration) {
                console.log('✅ Migration v2: Adding currency to expenses...');
                
                const migratePromises = expensesCache
                    .filter(exp => !exp.migrated)
                    .map(exp => {
                        exp.migrated = true;
                        return Database.updateExpense(currentUser.uid, exp.id, { 
                            currency: exp.currency 
                        });
                    });
                
                await Promise.all(migratePromises);
                
                await setDoc(doc(db, 'users', currentUser.uid), {
                    migrationVersion: 2
                }, { merge: true });
                
                showInfoToast('Expense data updated');
            } else {
                await setDoc(doc(db, 'users', currentUser.uid), {
                    migrationVersion: 2
                }, { merge: true });
            }
        }
        
        // ✅ MIGRATION VERSION 3: Fix USD/VND currency mismatch
        if (currentMigrationVersion < 3) {
            const userCurrency = data.currency || 'VND';
            let needsCurrencyFix = false;
            
            console.log('🔧 Migration v3: Checking for currency mismatches...');
            console.log('User currency:', userCurrency);
            
            expensesCache.forEach(exp => {
                // If user currency is VND and expense is marked as USD
                if (userCurrency === 'VND' && exp.currency === 'USD') {
                    // Check if this looks like a VND amount (no decimals, reasonable size)
                    const hasDecimals = exp.amount % 1 !== 0;
                    const isLargeNumber = exp.amount >= 1000;
                    
                    // If it looks like VND (whole number >= 1000), fix it
                    if (!hasDecimals && isLargeNumber) {
                        console.log(`  🔧 Fixing ${exp.name}: ${exp.amount} USD → VND`);
                        exp.currency = 'VND';
                        needsCurrencyFix = true;
                    }
                }
                
                // If user currency is USD and expense is marked as VND
                if (userCurrency === 'USD' && exp.currency === 'VND') {
                    // Check if this looks like a USD amount (has decimals or small)
                    const hasDecimals = exp.amount % 1 !== 0;
                    const isSmallNumber = exp.amount < 1000;
                    
                    // If it looks like USD (decimals or < 1000), fix it
                    if (hasDecimals || isSmallNumber) {
                        console.log(`  🔧 Fixing ${exp.name}: ${exp.amount} VND → USD`);
                        exp.currency = 'USD';
                        needsCurrencyFix = true;
                    }
                }
            });
            
            if (needsCurrencyFix) {
                console.log('✅ Migration v3: Fixing currency mismatches...');
                
                const updatePromises = expensesCache.map(exp => 
                    Database.updateExpense(currentUser.uid, exp.id, { 
                        currency: exp.currency 
                    })
                );
                
                await Promise.all(updatePromises);
                
                await setDoc(doc(db, 'users', currentUser.uid), {
                    migrationVersion: 3
                }, { merge: true });
                
                showSuccessToast('Fixed currency data for expenses');
            } else {
                await setDoc(doc(db, 'users', currentUser.uid), {
                    migrationVersion: 3
                }, { merge: true });
            }
        }
        
        localStorage.setItem(`expenses_${currentUser.uid}`, JSON.stringify(expensesCache));
        
        // ✅ FIX 3: LOAD THE CURRENT MONTH'S BUDGET
        const currentMonth = getCurrentMonthKey();
        
        console.log('📅 Current month:', currentMonth);
        console.log('📊 All budgets in cache:', Object.keys(monthlyBudgetsCache));
        
        let currentMonthBudget = monthlyBudgetsCache[currentMonth];
        
        if (!currentMonthBudget) {
            console.warn('⚠️ No budget found for', currentMonth);
            
            // ✅ Check if there's ANY budget we can use as a template
            const existingBudgets = Object.values(monthlyBudgetsCache);
            
            if (existingBudgets.length > 0) {
                // Use the most recent budget as a template
                const templateBudget = existingBudgets[existingBudgets.length - 1];
                console.log('📋 Using template from existing budget:', templateBudget);
                
                currentMonthBudget = {
                    needs: templateBudget.needs || 50,
                    wants: templateBudget.wants || 30,
                    savings: templateBudget.savings || 20,
                    income: templateBudget.income || 5200,
                    currency: templateBudget.currency || data.currency || 'USD'
                };
            } else {
                // No budgets exist at all - use true defaults
                currentMonthBudget = {
                    needs: 50,
                    wants: 30,
                    savings: 20,
                    income: 5200,
                    currency: data.currency || 'USD'
                };
            }
            
            // Save the new budget
            monthlyBudgetsCache[currentMonth] = currentMonthBudget;
            
            if (currentUser) {
                console.log('💾 Saving new budget for', currentMonth);
                await Database.saveMonthlyBudget(
                    currentUser.uid, 
                    currentMonth, 
                    currentMonthBudget, 
                    currentMonthBudget.currency
                );
            }
        }
        
        console.log('✅ Using budget for', currentMonth, ':', currentMonthBudget);
        
        // ✅ Update budget sliders
        const needsInput = document.getElementById('input-needs');
        const wantsInput = document.getElementById('input-wants');
        const savingsInput = document.getElementById('input-savings');
        
        if(needsInput) needsInput.value = currentMonthBudget.needs;
        if(wantsInput) wantsInput.value = currentMonthBudget.wants;
        if(savingsInput) savingsInput.value = currentMonthBudget.savings;
        
        // ✅ CRITICAL: Update income display
        const incomeInput = document.getElementById('income-input');
        if(incomeInput) {
            const storedCurrency = currentMonthBudget.currency || data.currency || 'USD';
            
            // ✅ Set base value from database
            incomeInput.dataset.value = currentMonthBudget.income;
            incomeInput.dataset.currency = storedCurrency;
            
            // ✅ FIX: Display in the stored currency (no conversion)
            incomeInput.value = formatNumber(currentMonthBudget.income, storedCurrency);
            
            console.log('💰 Income loaded:', {
                month: currentMonth,
                storedValue: currentMonthBudget.income,
                storedCurrency,
                displayValue: currentMonthBudget.income,
                displayCurrency: storedCurrency
            });
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
        
        const currentYear = new Date().getFullYear().toString();
        updateMonthlyChart(currentYear);
        
        updateSettingsUI();
        
    } catch (e) {
        console.error("Error loading user data:", e);
        showErrorToast('Failed to load your data. Please refresh the page.');
    } finally {
        hideSync();
    }
}

// ===================================
// DEBUG FUNCTION (Temporary)
// ===================================
async function debugFirebaseData() {
    if (!currentUser) return;
    
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    if (userDoc.exists()) {
        console.log('🔍 FIREBASE DATA:', JSON.stringify(userDoc.data(), null, 2));
    } else {
        console.log('❌ No user document found');
    }
}

// ===================================
// UI UPDATE FUNCTIONS
// ===================================
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
    
    // ✅ AUTO-ADJUST: If total isn't 100%, scale proportionally
    if (total !== 100 && total > 0) {
        const scale = 100 / total;
        const adjustedNeeds = Math.round(needs * scale);
        const adjustedWants = Math.round(wants * scale);
        const adjustedSavings = 100 - adjustedNeeds - adjustedWants;
        
        needsInput.value = adjustedNeeds;
        wantsInput.value = adjustedWants;
        savingsInput.value = adjustedSavings;
        
        document.getElementById('val-needs').value = adjustedNeeds + '%';
        document.getElementById('val-wants').value = adjustedWants + '%';
        document.getElementById('val-savings').value = adjustedSavings + '%';
    } else {
        document.getElementById('val-needs').value = needs + '%';
        document.getElementById('val-wants').value = wants + '%';
        document.getElementById('val-savings').value = savings + '%';
    }
    
    const totalPercentage = document.getElementById('total-percentage');
    if(totalPercentage) {
        const finalTotal = parseInt(needsInput.value) + parseInt(wantsInput.value) + parseInt(savingsInput.value);
        totalPercentage.textContent = finalTotal + '%';
        totalPercentage.style.color = finalTotal === 100 ? '#10b981' : '#f59e0b';
    }
    
    if (window.uniforms) window.uniforms.uDistortion.value = parseInt(needsInput.value) / 100;
    
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
    
    if(aNeeds) aNeeds.textContent = formatCurrency(displayIncome * parseInt(needsInput.value) / 100, currentCurrency);
    if(aWants) aWants.textContent = formatCurrency(displayIncome * parseInt(wantsInput.value) / 100, currentCurrency);
    if(aSavings) aSavings.textContent = formatCurrency(displayIncome * parseInt(savingsInput.value) / 100, currentCurrency);

    if (currentUser && parseInt(needsInput.value) + parseInt(wantsInput.value) + parseInt(savingsInput.value) === 100) {
        const budgetMonthPicker = document.getElementById('budget-month-picker');
        const targetMonth = budgetMonthPicker ? budgetMonthPicker.value : getCurrentMonthKey();
        
        const budget = { 
            needs: parseInt(needsInput.value), 
            wants: parseInt(wantsInput.value), 
            savings: parseInt(savingsInput.value), 
            income: baseIncome,
            currency: storedCurrency
        };
        
        monthlyBudgetsCache[targetMonth] = budget;
        Database.saveMonthlyBudget(currentUser.uid, targetMonth, budget, storedCurrency);
    }
    
    if (BudgetPlanner.updateSavingsGoalBox) {
        BudgetPlanner.updateSavingsGoalBox();
    }
}

// ===================================
// MONTHLY CHART FUNCTIONS
// ===================================
function calculateMonthlyData(expenses, year) {
    const categories = getCategoryLabels();
    
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
            const expenseCurrency = exp.currency || currentCurrency || 'USD';
            
            if (expenseCurrency !== currentCurrency) {
                amount = convertCurrency(amount, expenseCurrency, currentCurrency);
            }
            
            if (!isNaN(amount) && amount > 0) {
                data[category][monthIndex] += amount;
            } else {
                console.warn('Invalid expense amount:', exp);
            }
        }
    });
    
    return data;
}

function updateMonthlyChart(year = null) {
    if (!window.monthlyStackedChart) return;
    
    const selectedYear = year || document.getElementById('analytics-year-picker')?.value || new Date().getFullYear().toString();
    
    const chartData = calculateMonthlyData(expensesCache, selectedYear);
    
    const getMonthlyIncomeData = () => {
        const incomeData = Array(12).fill(null);
        
        for (let month = 0; month < 12; month++) {
            let hasData = false;
            Object.values(chartData).forEach(monthlyData => {
                if (monthlyData[month] > 0) {
                    hasData = true;
                }
            });
            
            if (hasData) {
                const monthKey = `${selectedYear}-${String(month + 1).padStart(2, '0')}`;
                const monthBudget = monthlyBudgetsCache[monthKey];
                
                if (monthBudget && monthBudget.income) {
                    let displayIncome = monthBudget.income;
                    const storedCurrency = monthBudget.currency || 'USD';
                    
                    if (storedCurrency !== currentCurrency) {
                        displayIncome = convertCurrency(displayIncome, storedCurrency, currentCurrency);
                    }
                    
                    incomeData[month] = displayIncome;
                }
            }
        }
        
        return incomeData;
    };

    const monthlyIncomeData = getMonthlyIncomeData();
    
    const categoryYearlyTotals = {};
    window.monthlyStackedChart.data.datasets.forEach(dataset => {
        if (dataset.label === 'Monthly Income') return;
        
        const total = chartData[dataset.label] 
            ? chartData[dataset.label].reduce((sum, val) => sum + val, 0)
            : 0;
        categoryYearlyTotals[dataset.label] = total;
    });
    
    const sortedLabels = Object.keys(categoryYearlyTotals)
        .sort((a, b) => categoryYearlyTotals[b] - categoryYearlyTotals[a]);
    
    window.monthlyStackedChart.data.datasets.forEach((dataset) => {
        if (dataset.label === 'Monthly Income') {
            dataset.data = [...monthlyIncomeData];
            dataset.order = 1;
            return;
        }
        
        if (chartData[dataset.label]) {
            dataset.data = [...chartData[dataset.label]];
        } else {
            dataset.data = Array(12).fill(0);
        }
        
        dataset.order = sortedLabels.indexOf(dataset.label) + 2;
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
    window.monthlyStackedChart.update('active');
    updateChartStats(chartData, selectedYear);
}

function updateChartStats(chartData, year) {
    let yearTotal = 0;
    Object.values(chartData).forEach(monthlyData => {
        yearTotal += monthlyData.reduce((sum, val) => sum + val, 0);
    });
    
    const yearTotalEl = document.getElementById('year-total');
    const yearTotalLabel = document.getElementById('year-total-label');
    if(yearTotalEl) yearTotalEl.textContent = formatCurrency(yearTotal, currentCurrency);
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
        topCatAmountEl.textContent = `${formatCurrency(topAmount, currentCurrency)} (${percent}%)`;
        if(topCatBarEl) topCatBarEl.style.width = `${percent}%`;
    } else if(topCatAmountEl) {
        topCatAmountEl.textContent = `${formatCurrency(0, currentCurrency)} (0%)`;
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
        if(highestAmountEl) highestAmountEl.textContent = formatCurrency(0, currentCurrency);
        if(lowestMonthEl) lowestMonthEl.textContent = 'N/A';
        if(lowestAmountEl) lowestAmountEl.textContent = formatCurrency(0, currentCurrency);
    } else {
        const maxMonth = monthlyTotals.indexOf(Math.max(...monthlyTotals));
        const minMonth = monthlyTotals.indexOf(Math.min(...nonZeroMonths));
        
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        
        const highestMonthEl = document.getElementById('highest-month');
        const highestAmountEl = document.getElementById('highest-amount');
        const lowestMonthEl = document.getElementById('lowest-month');
        const lowestAmountEl = document.getElementById('lowest-amount');
        
        if(highestMonthEl) highestMonthEl.textContent = months[maxMonth];
        if(highestAmountEl) highestAmountEl.textContent = formatCurrency(monthlyTotals[maxMonth], currentCurrency);
        if(lowestMonthEl) lowestMonthEl.textContent = months[minMonth];
        if(lowestAmountEl) lowestAmountEl.textContent = formatCurrency(monthlyTotals[minMonth], currentCurrency);
    }
    
    const annualBudget = getUserIncome() * 12;
    const runningTotal = yearTotal;
    const remaining = annualBudget - runningTotal;
    
    const runningTotalEl = document.getElementById('running-total');
    const annualBudgetEl = document.getElementById('annual-budget');
    const budgetRemainingEl = document.getElementById('budget-remaining');
    const budgetProgressBar = document.getElementById('budget-progress-bar');
    
    if(runningTotalEl) runningTotalEl.textContent = formatCurrency(runningTotal, currentCurrency);
    if(annualBudgetEl) annualBudgetEl.textContent = formatCurrency(annualBudget, currentCurrency);
    if(budgetRemainingEl) budgetRemainingEl.textContent = formatCurrency(Math.max(0, remaining), currentCurrency);
    if(budgetProgressBar && annualBudget > 0) {
        const percent = Math.min(100, Math.round((runningTotal / annualBudget) * 100));
        budgetProgressBar.style.width = `${percent}%`;
    }
}

// ===================================
// CORE API FOR MODULES
// ===================================
const coreAPI = {
    getUser: () => currentUser,
    getExpenses: () => expensesCache,
    setExpenses: (newExpenses) => { 
        expensesCache = newExpenses;
        buildExpenseIndex();
        if(currentUser) localStorage.setItem(`expenses_${currentUser.uid}`, JSON.stringify(expensesCache));
    },
    
    getExpensesByMonth: (year, month) => {
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        return expensesByMonth[monthKey] || [];
    },
    
    getIncome: getUserIncome,
    getCurrency: () => currentCurrency,
    formatCurrency: (amount) => formatCurrency(amount, currentCurrency),
    formatNumber: (num) => formatNumber(num, currentCurrency),
    showSync: showSync,
    hideSync: hideSync,
    showToast: showToast,
    showSuccessToast: showSuccessToast,
    showErrorToast: showErrorToast,
    showWarningToast: showWarningToast,
    showConfirm: showConfirm,
    convertCurrency: convertCurrency
};

// ===================================
// DOM READY EVENT LISTENERS
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    
    // Initialize modules
    try { ExpenseTracker.init(coreAPI); } catch(e) { console.error("ExpenseTracker init failed", e); }
    try { BudgetPlanner.init(coreAPI); } catch(e) { console.error("BudgetPlanner init failed", e); }
    try { init3DBackground(); } catch(e) { console.error("3D init failed", e); }

    // Populate category dropdown
    const expenseCategorySelect = document.getElementById('expense-category');
    if (expenseCategorySelect) {
        expenseCategorySelect.innerHTML = `
            <option value="" disabled selected>Select</option>
            ${getCategoryOptions()}
        `;
    }

    // Setup authentication
    setupAuth({
        onLogin: (user) => { 
            currentUser = user; 
            loadAndRenderData();
            updateSettingsUI();
            showSuccessToast(`Welcome back, ${user.displayName || user.email.split('@')[0]}!`);
            
            // ✅ Debug Firebase data after login
            setTimeout(() => {
                if (currentUser) debugFirebaseData();
            }, 2000);
        },
        onLogout: () => { 
            currentUser = null; 
            expensesCache = []; 
            monthlyBudgetsCache = {};
            currentBudgetMonth = null;
            expensesByMonth = {};
            
            if (ExpenseTracker.update) ExpenseTracker.update(); 
            
            if (BudgetPlanner.setFunds) BudgetPlanner.setFunds([]);
            if (BudgetPlanner.setSimulatedData) BudgetPlanner.setSimulatedData({});
            if (BudgetPlanner.renderFundsList) BudgetPlanner.renderFundsList();
            if (window.budgetChart) {
                window.budgetChart.destroy();
                window.budgetChart = null;
            }
            
            updateMonthlyChart();
            showInfoToast('You have been logged out');
        }
    });

    // ===================================
    // EXPENSE FORM SUBMISSION
    // ===================================
    const expForm = document.getElementById('expense-form');
    if(expForm) {
        expForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if(!currentUser) {
                showErrorToast('Please login to save expenses');
                return;
            }
            
            const amount = parseFloat(document.getElementById('expense-amount').value);
            const categorySelect = document.getElementById('expense-category');
            const nameInput = document.getElementById('expense-name');
            
            if (!nameInput.value.trim()) {
                showWarningToast('Please enter an expense name');
                nameInput.focus();
                return;
            }
            
            if (!categorySelect.value) {
                showWarningToast('Please select a category');
                categorySelect.focus();
                return;
            }
            
            if (isNaN(amount) || amount <= 0) {
                showWarningToast('Please enter a valid amount');
                document.getElementById('expense-amount').focus();
                return;
            }
            
            const expense = {
                date: document.getElementById('expense-date').value,
                name: nameInput.value.trim(),
                category: categorySelect.value,
                amount: amount,
                currency: currentCurrency
            };
            
            try {
                showSync();
                const id = await Database.saveExpense(currentUser.uid, expense, currentCurrency);
                expensesCache.unshift({ id, ...expense });
                buildExpenseIndex();
                localStorage.setItem(`expenses_${currentUser.uid}`, JSON.stringify(expensesCache));
                hideSync();
                
                if (ExpenseTracker.update) ExpenseTracker.update();
                updateMonthlyChart();
                
                if (BudgetPlanner.updateSavingsGoalBox) {
                    BudgetPlanner.updateSavingsGoalBox();
                }
                
                showSuccessToast(`Added "${expense.name}" - ${formatCurrency(expense.amount, currentCurrency)}`);
                
                e.target.reset();
                document.getElementById('expense-date').valueAsDate = new Date();
                nameInput.focus();
            } catch (error) {
                console.error('Error saving expense:', error);
                hideSync();
                showErrorToast('Failed to save expense. Please check your connection and try again.');
            }
        });
    }

    // ===================================
    // CURRENCY SELECTOR
    // ===================================
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
                
                incomeInput.value = formatNumber(displayIncome, currentCurrency);
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
            
            showInfoToast(`Currency changed to ${newCur}`);
        });
    });

    // Settings currency select
    const settingsCurrencySelect = document.getElementById('settings-currency-select');
    if(settingsCurrencySelect) {
        settingsCurrencySelect.value = currentCurrency;
        settingsCurrencySelect.addEventListener('change', (e) => {
            const newCur = e.target.value;
            const currencyBtn = document.querySelector(`.currency-selector[data-currency="${newCur}"]`);
            if(currencyBtn) currencyBtn.click();
        });
    }
    
    // ===================================
    // BUDGET MONTH PICKER
    // ===================================
    const budgetMonthPicker = document.getElementById('budget-month-picker');
    const incomeMonthLabel = document.getElementById('current-month');
    
    if (budgetMonthPicker) {
        const currentMonthVal = utilGetCurrentMonthKey();
        budgetMonthPicker.value = currentMonthVal;
        currentBudgetMonth = currentMonthVal;
        
        if (incomeMonthLabel) {
            incomeMonthLabel.textContent = formatMonthLabel(currentMonthVal);
        }
        
        budgetMonthPicker.addEventListener('change', (e) => {
            const selectedMonth = e.target.value;
            
            console.log('📅 Budget month changed to:', selectedMonth);
            
            if (incomeMonthLabel) {
                incomeMonthLabel.textContent = formatMonthLabel(selectedMonth);
            }
            
            loadMonthBudget(selectedMonth);
            
            currentBudgetMonth = selectedMonth;
            
            const [pickerYear] = selectedMonth.split('-');
            const chartYear = document.getElementById('analytics-year-picker')?.value || new Date().getFullYear().toString();
            
            if (pickerYear === chartYear) {
                updateMonthlyChart(chartYear);
            }
        });
    }

    // ===================================
    // INCOME INPUT
    // ===================================
    const incInput = document.getElementById('income-input');
    if(incInput) {
        if (!incInput.dataset.currency) {
            incInput.dataset.currency = currentCurrency;
        }
        
        // ✅ NEW: Press Enter to save
        incInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.blur();
                
                this.style.transform = 'scale(0.98)';
                setTimeout(() => {
                    this.style.transform = 'scale(1)';
                }, 100);
            }
        });
        
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
            
            if (val < 0) {
                showWarningToast('Income cannot be negative');
                val = 0;
            }
            
            console.log('💾 Income blur - saving:', val);
            
            this.dataset.value = val;
            this.dataset.currency = currentCurrency;
            
            if(currentUser) {
                const budgetMonthPicker = document.getElementById('budget-month-picker');
                const targetMonth = budgetMonthPicker ? budgetMonthPicker.value : getCurrentMonthKey();
                
                console.log('💾 Saving income for month:', targetMonth);
                
                if (!monthlyBudgetsCache[targetMonth]) {
                    monthlyBudgetsCache[targetMonth] = {
                        needs: parseInt(document.getElementById('input-needs').value) || 50,
                        wants: parseInt(document.getElementById('input-wants').value) || 30,
                        savings: parseInt(document.getElementById('input-savings').value) || 20,
                        income: val,
                        currency: currentCurrency
                    };
                } else {
                    monthlyBudgetsCache[targetMonth].income = val;
                    monthlyBudgetsCache[targetMonth].currency = currentCurrency;
                }
                
                console.log('💰 Budget for', targetMonth, ':', monthlyBudgetsCache[targetMonth]);
                
                Database.saveMonthlyBudget(
                    currentUser.uid, 
                    targetMonth, 
                    monthlyBudgetsCache[targetMonth], 
                    currentCurrency
                ).then(() => {
                    console.log('✅ Income saved successfully for', targetMonth);
                    showSuccessToast(`Income updated to ${formatCurrency(val, currentCurrency)} for ${formatMonthLabel(targetMonth)}`);
                }).catch(error => {
                    console.error('❌ Error saving income:', error);
                    showErrorToast('Failed to save income');
                });
            } else {
                localStorage.setItem(`income`, val);
            }
            
            this.value = formatNumber(val, currentCurrency);
            updateBudgetAllocation();
            updateMonthlyChart();
            
            if (BudgetPlanner.updateSavingsGoalBox) {
                BudgetPlanner.updateSavingsGoalBox();
            }
        });
    }

    // ===================================
    // BUDGET SLIDERS
    // ===================================
    let budgetSaveTimeout;

    ['needs', 'wants', 'savings'].forEach(type => {
        const slider = document.getElementById(`input-${type}`);
        const input = document.getElementById(`val-${type}`);
        if(slider && input) {
            slider.addEventListener('input', () => {
                updateBudgetAllocation();
                
                clearTimeout(budgetSaveTimeout);
                budgetSaveTimeout = setTimeout(() => {
                    if (currentUser) {
                        const budgetMonthPicker = document.getElementById('budget-month-picker');
                        const targetMonth = budgetMonthPicker ? budgetMonthPicker.value : getCurrentMonthKey();
                        const needs = parseInt(document.getElementById('input-needs').value);
                        const wants = parseInt(document.getElementById('input-wants').value);
                        const savings = parseInt(document.getElementById('input-savings').value);
                        const total = needs + wants + savings;
                        
                        if (total === 100) {
                            const incomeInput = document.getElementById('income-input');
                            const budget = {
                                needs,
                                wants,
                                savings,
                                income: parseFloat(incomeInput.dataset.value) || 5200,
                                currency: incomeInput.dataset.currency || currentCurrency
                            };
                            
                            monthlyBudgetsCache[targetMonth] = budget;
                            Database.saveMonthlyBudget(currentUser.uid, targetMonth, budget, currentCurrency);
                        }
                    }
                }, 500);
            });
            
            input.addEventListener('blur', function() {
                let val = Math.max(0, Math.min(100, parseInt(this.value.replace('%','')) || 0));
                this.value = val + '%'; 
                slider.value = val; 
                updateBudgetAllocation();
            });
        }
    });

    // ===================================
    // EXPORT DATA
    // ===================================
    const exportBtn = document.getElementById('export-data-btn');
    if(exportBtn) {
        exportBtn.addEventListener('click', () => {
            if(!currentUser) {
                showErrorToast('Please login first');
                return;
            }
            
            try {
                const exportData = {
                    user: currentUser.email,
                    currency: currentCurrency,
                    monthlyBudgets: monthlyBudgetsCache,
                    expenses: expensesCache,
                    sinkingFunds: BudgetPlanner.getFunds ? BudgetPlanner.getFunds() : [],
                    fundAllocations: BudgetPlanner.getSimulatedData ? BudgetPlanner.getSimulatedData() : {},
                    exportedAt: new Date().toISOString()
                };
                
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `financeflow-export-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                
                showSuccessToast('Data exported successfully');
            } catch (error) {
                console.error('Export error:', error);
                showErrorToast('Failed to export data');
            }
        });
    }

    // Settings logout button
    const settingsLogoutBtn = document.getElementById('settings-logout-btn');
    if(settingsLogoutBtn) {
        settingsLogoutBtn.addEventListener('click', () => {
            document.getElementById('logout-btn')?.click();
            document.getElementById('settings-modal')?.classList.remove('active');
        });
    }

    // Open settings button
    const openSettingsBtn = document.getElementById('open-settings-btn');
    if(openSettingsBtn) {
        openSettingsBtn.addEventListener('click', () => {
            document.getElementById('settings-modal')?.classList.add('active');
        });
    }

    // Close settings button
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    if(closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            document.getElementById('settings-modal')?.classList.remove('active');
        });
    }

    // Set default expense date
    const expDate = document.getElementById('expense-date');
    if(expDate) expDate.valueAsDate = new Date();
    
    // Initial budget allocation
    updateBudgetAllocation();

    // ===================================
    // KEYBOARD SHORTCUTS
    // ===================================
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
                return;
            }
            if (budgetModal && budgetModal.classList.contains('active')) {
                budgetModal.classList.remove('active');
                document.body.style.overflow = 'auto';
                if(window.budgetChart) {
                    window.budgetChart.destroy();
                    window.budgetChart = null;
                }
                return;
            }
            
            const expName = document.getElementById('expense-name');
            if(expName) expName.focus();
        }
    });

    // ===================================
    // SETTINGS TOGGLE SWITCHES
    // ===================================
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
        const settingKey = toggle.dataset.setting;
        
        if (settingKey) {
            const savedState = localStorage.getItem(`setting_${settingKey}`);
            if (savedState !== null) {
                toggle.dataset.enabled = savedState;
            }
        }

        const updateVisuals = (element) => {
            const isEnabled = element.dataset.enabled === 'true';
            const thumb = element.querySelector('.toggle-thumb');
            
            if (isEnabled) {
                element.classList.add('bg-emerald-500');
                element.classList.remove('bg-slate-700/50');
                thumb.style.transform = 'translateX(20px)';
            } else {
                element.classList.remove('bg-emerald-500');
                element.classList.add('bg-slate-700/50');
                thumb.style.transform = 'translateX(0)';
            }
        };

        updateVisuals(toggle);

        toggle.addEventListener('click', () => {
            const isEnabled = toggle.dataset.enabled === 'true';
            
            toggle.dataset.enabled = (!isEnabled).toString();
            updateVisuals(toggle);
            
            if (settingKey) {
                localStorage.setItem(`setting_${settingKey}`, toggle.dataset.enabled);
                
                const statusName = settingKey.replace(/([A-Z])/g, ' $1').toLowerCase();
                showInfoToast(`${statusName} ${!isEnabled ? 'enabled' : 'disabled'}`);
            }
        });
    });
});

// ===================================
// EXPOSE UPDATE FUNCTION GLOBALLY
// ===================================
if (typeof window !== 'undefined') {
    window.updateMonthlyChart = updateMonthlyChart;
}
