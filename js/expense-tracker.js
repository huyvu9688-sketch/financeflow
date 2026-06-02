// expense-tracker.js
import { Database } from './database.js';
import { getCategoryOptions, getCategoryColor, getCategoryBudgetType, getCategoryLabel } from './constants.js';
import { escapeHtml, getDaysRemainingInMonth } from './utils.js';

// ===================================
// HELPER FUNCTIONS FOR DONUT CHART
// ===================================
function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians))
    };
}

function describeArc(x, y, radius, startAngle, endAngle) {
    const gapSize = 0.5;
    const adjustedStartAngle = startAngle + gapSize;
    const adjustedEndAngle = endAngle - gapSize;
    const start = polarToCartesian(x, y, radius, adjustedEndAngle);
    const end = polarToCartesian(x, y, radius, adjustedStartAngle);
    const largeArcFlag = (adjustedEndAngle - adjustedStartAngle) <= 180 ? "0" : "1";
    return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(" ");
}

// ===================================
// STATE MANAGEMENT
// ===================================
let core = {};

// ✅ PAGINATION STATE (Virtual Scrolling)
const ITEMS_PER_PAGE = 50;
let currentPage = 1;
let allFilteredExpenses = [];

// ===================================
// EXPENSE TRACKER MODULE
// ===================================
export const ExpenseTracker = {
    state: {
        selectedMonth: new Date().getMonth(),
        selectedYear: new Date().getFullYear(),
        currentFilter: 'all',
        currentSearchTerm: ''
    },

    // ===================================
    // INITIALIZATION
    // ===================================
    init(coreFunctions) {
        core = coreFunctions;
        
        const expModal = document.getElementById('expense-modal');
        const trackingCard = document.getElementById('expense-tracking-card');
        
        if (!expModal || !trackingCard) {
            console.warn("Expense modal HTML missing. Skipping init.");
            return;
        }

        // Populate category filter
        const categoryFilter = document.getElementById('category-filter');
        if (categoryFilter) {
            categoryFilter.innerHTML = `
                <option value="all">All Categories</option>
                ${getCategoryOptions()}
            `;
        }

        // ✅ OPTIMIZED: Debounced search (300ms)
        const searchInput = document.getElementById('expense-search');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.state.currentSearchTerm = e.target.value.toLowerCase();
                    this.update();
                }, 300);
            });
        }

        // Category filter
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.state.currentFilter = e.target.value;
                this.update();
            });
        }

        // Month picker
        const monthPicker = document.getElementById('month-picker');
        if (monthPicker) {
            monthPicker.value = `${this.state.selectedYear}-${String(this.state.selectedMonth + 1).padStart(2, '0')}`;
            monthPicker.addEventListener('change', (e) => {
                const [year, month] = e.target.value.split('-');
                this.state.selectedYear = parseInt(year);
                this.state.selectedMonth = parseInt(month) - 1;
                
                // Update month label
                const monthLabel = document.getElementById('current-month');
                if (monthLabel) {
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                       'July', 'August', 'September', 'October', 'November', 'December'];
                    monthLabel.textContent = monthNames[this.state.selectedMonth];
                }
                
                // Update modal label
                const modalLabel = document.getElementById('total-spend-label');
                if (modalLabel) {
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                       'July', 'August', 'September', 'October', 'November', 'December'];
                    modalLabel.textContent = `${monthNames[this.state.selectedMonth]} ${this.state.selectedYear} Spend`;
                }
                
                this.update();
            });
        }

        // Modal trigger
        trackingCard.addEventListener('click', () => {
            expModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            this.update();
        });

        // Close button
        const closeBtn = document.getElementById('close-expense-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                expModal.classList.remove('active');
                document.body.style.overflow = 'auto';
            });
        }
    },

    // ===================================
    // UPDATE - MAIN RENDER TRIGGER
    // ===================================
    update() {
        currentPage = 1; // ✅ Reset pagination
        
        const income = core.getIncome();
        
        // ✅ OPTIMIZED: Use month index instead of filtering all expenses
        let filtered = core.getExpensesByMonth 
            ? core.getExpensesByMonth(this.state.selectedYear, this.state.selectedMonth)
            : core.getExpenses().filter(exp => {
                const expDate = new Date(exp.date);
                return expDate.getMonth() === this.state.selectedMonth && 
                       expDate.getFullYear() === this.state.selectedYear;
              });
        
        // Apply search and category filters
        filtered = filtered.filter(exp => {
            const matchesSearch = exp.name.toLowerCase().includes(this.state.currentSearchTerm);
            const matchesCategory = this.state.currentFilter === 'all' || exp.category === this.state.currentFilter;
            return matchesSearch && matchesCategory;
        });
        
        // Calculate category totals
        const categoryTotals = {};
        let totalSpend = 0;
        
        filtered.forEach(exp => {
            if (!categoryTotals[exp.category]) {
                categoryTotals[exp.category] = 0;
            }
            categoryTotals[exp.category] += exp.amount;
            totalSpend += exp.amount;
        });
        
        // Render all components
        this.renderHistoryList(filtered);
        this.renderDonutChart(categoryTotals, totalSpend, income, filtered);
        this.renderStats(totalSpend, income, categoryTotals); 
    },

    // ===================================
    // RENDER HISTORY LIST (Virtual Scrolling)
    // ===================================
    renderHistoryList(expenses) {
        const historyList = document.getElementById('expense-history-list');
        if (!historyList) return;

        allFilteredExpenses = expenses;
        
        if (expenses.length === 0) {
            historyList.innerHTML = '<div class="text-center text-zinc-500 text-sm py-8">No expenses found</div>';
            return;
        }
        
        // ✅ OPTIMIZED: Only render up to current page
        const endIndex = Math.min(ITEMS_PER_PAGE * currentPage, expenses.length);
        const visibleExpenses = expenses.slice(0, endIndex);
        
        // Clear list only on first page
        if (currentPage === 1) {
            historyList.innerHTML = '';
        }
        
        const currency = core.getCurrency();
        
        visibleExpenses.forEach(exp => {
            // Skip if already rendered
            if (document.querySelector(`[data-id="${exp.id}"]`)) {
                return;
            }
            
            const displayInputValue = currency === 'VND' ? exp.amount / 1000 : exp.amount;
            const formattedAmount = core.formatNumber(exp.amount);
            
            const row = document.createElement('div');
            row.className = 'expense-history-item';
            row.setAttribute('data-id', exp.id);
            
            row.innerHTML = `
                <div class="flex-1 min-w-0">
                    <input type="text" class="expense-name-editable w-full" value="${escapeHtml(exp.name)}" data-id="${exp.id}" readonly>
                    <div class="text-xs text-zinc-500 mt-1 flex items-center gap-2">
                        <select class="expense-category-editable" data-id="${exp.id}" disabled>
                            ${getCategoryOptions(exp.category)}
                        </select>
                        <span>•</span>
                        <span>${new Date(exp.date).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="text-right">
                        <input type="number" class="expense-amount-editable" value="${displayInputValue}" data-id="${exp.id}" step="${currency === 'USD' ? '0.01' : '1'}" readonly style="display: none;">
                        <div class="expense-amount-display" data-id="${exp.id}">${formattedAmount}</div>
                    </div>
                    <div class="action-buttons">
                        <button class="edit-expense-btn" data-id="${exp.id}" type="button" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="delete-expense-btn" data-id="${exp.id}" type="button" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
            
            historyList.appendChild(row);
        });
        
        // ✅ Add/update "Load More" button
        this.renderLoadMoreButton(historyList, expenses.length, endIndex);
        
        this.setupEventDelegation();
    },

    // ===================================
    // RENDER LOAD MORE BUTTON
    // ===================================
    renderLoadMoreButton(container, totalCount, loadedCount) {
        // Remove existing button/message
        const existingBtn = container.querySelector('.load-more-btn');
        const existingMsg = container.querySelector('.all-loaded-msg');
        if (existingBtn) existingBtn.remove();
        if (existingMsg) existingMsg.remove();
        
        if (loadedCount < totalCount) {
            // Show "Load More" button
            const button = document.createElement('button');
            button.className = 'load-more-btn w-full py-3 text-sm text-emerald-400 hover:text-emerald-300 transition-colors border-t border-zinc-800 mt-2 font-mono';
            button.innerHTML = `
                <div class="flex items-center justify-center gap-2">
                    <iconify-icon icon="solar:refresh-linear"></iconify-icon>
                    <span>Load More (${loadedCount} of ${totalCount})</span>
                </div>
            `;
            button.onclick = () => {
                currentPage++;
                this.renderHistoryList(allFilteredExpenses);
            };
            container.appendChild(button);
        } else if (totalCount > ITEMS_PER_PAGE) {
            // Show "All loaded" message
            const message = document.createElement('div');
            message.className = 'all-loaded-msg w-full py-2 text-xs text-zinc-600 text-center border-t border-zinc-800 mt-2 font-mono';
            message.textContent = `All ${totalCount} expenses loaded`;
            container.appendChild(message);
        }
    },

    // ===================================
    // EVENT DELEGATION FOR EXPENSE ACTIONS
    // ===================================
    setupEventDelegation() {
        const historyList = document.getElementById('expense-history-list');
        if (!historyList || historyList.dataset.delegationSetup) return;
        
        historyList.dataset.delegationSetup = 'true';
        
        historyList.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-expense-btn');
            const deleteBtn = e.target.closest('.delete-expense-btn');
            
            if (editBtn) {
                e.preventDefault();
                e.stopPropagation();
                const id = editBtn.getAttribute('data-id');
                this.toggleEdit(id);
            }
            
            if (deleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                const id = deleteBtn.getAttribute('data-id');
                this.deleteExpense(id);
            }
        });
    },

    // ===================================
    // DELETE EXPENSE
    // ===================================
    async deleteExpense(id) {
        const confirmed = await core.showConfirm(
            'This action cannot be undone. Are you sure you want to delete this expense?',
            'Delete Expense'
        );
        
        if (!confirmed) return;
        
        try {
            const user = core.getUser();
            const expense = core.getExpenses().find(e => e.id === id);
            const expenseName = expense ? expense.name : 'Expense';
            
            core.showSync();
            
            if (user) {
                await Database.deleteExpense(user.uid, id);
            }
            
            let expenses = core.getExpenses().filter(exp => exp.id !== id);
            core.setExpenses(expenses);
            
            core.hideSync();
            
            this.update();
            
            if (window.updateMonthlyChart) {
                window.updateMonthlyChart();
            }
            
            core.showSuccessToast(`Deleted "${expenseName}"`);
        } catch (error) {
            console.error('Error deleting expense:', error);
            core.hideSync();
            core.showErrorToast('Failed to delete expense. Please try again.');
        }
    },

    // ===================================
    // TOGGLE EDIT MODE
    // ===================================
    async toggleEdit(id) {
        const row = document.querySelector(`.expense-history-item[data-id="${id}"]`);
        if (!row) return;
        
        if (row.classList.contains('editing')) {
            await this.saveEdit(id, row);
        } else {
            this.enableEditMode(id, row);
        }
    },

    // ===================================
    // SAVE EDITED EXPENSE
    // ===================================
    async saveEdit(id, row) {
        try {
            const name = row.querySelector('.expense-name-editable').value.trim();
            const category = row.querySelector('.expense-category-editable').value;
            let amount = parseFloat(row.querySelector('.expense-amount-editable').value);
            
            if (!name) {
                core.showWarningToast('Expense name cannot be empty');
                row.querySelector('.expense-name-editable').focus();
                return;
            }
            
            if (!category) {
                core.showWarningToast('Please select a category');
                row.querySelector('.expense-category-editable').focus();
                return;
            }
            
            if (isNaN(amount) || amount <= 0) {
                core.showWarningToast('Please enter a valid amount greater than 0');
                row.querySelector('.expense-amount-editable').focus();
                return;
            }
            
            if (core.getCurrency() === 'VND') {
                amount *= 1000;
            }
            
            const user = core.getUser();
            
            core.showSync();
            
            if (user) {
                await Database.updateExpense(user.uid, id, { name, category, amount });
            }
            
            let expenses = core.getExpenses();
            const index = expenses.findIndex(e => e.id === id);
            if (index !== -1) {
                expenses[index] = { ...expenses[index], name, category, amount };
            }
            core.setExpenses(expenses);
            
            core.hideSync();
            
            this.update();
            
            if (window.updateMonthlyChart) {
                window.updateMonthlyChart();
            }
            
            core.showSuccessToast(`Updated "${name}"`);
        } catch (error) {
            console.error('Error updating expense:', error);
            core.hideSync();
            core.showErrorToast('Failed to update expense. Please try again.');
        }
    },

    // ===================================
    // ENABLE EDIT MODE
    // ===================================
    enableEditMode(id, row) {
        // Disable all other editing rows
        document.querySelectorAll('.expense-history-item.editing').forEach(r => {
            const originalId = r.getAttribute('data-id');
            const originalExpense = core.getExpenses().find(e => e.id === originalId);
            
            if (originalExpense) {
                r.querySelector('.expense-name-editable').value = originalExpense.name;
                r.querySelector('.expense-category-editable').value = originalExpense.category;
                const displayValue = core.getCurrency() === 'VND' 
                    ? originalExpense.amount / 1000 
                    : originalExpense.amount;
                r.querySelector('.expense-amount-editable').value = displayValue;
            }
            
            r.classList.remove('editing');
            r.querySelectorAll('input').forEach(i => i.readOnly = true);
            r.querySelector('select').disabled = true;
            r.querySelector('.expense-amount-editable').style.display = 'none';
            r.querySelector('.expense-amount-display').style.display = 'block';
            r.querySelector('.edit-expense-btn svg').innerHTML = `
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            `;
        });
        
        // Enable this row
        row.classList.add('editing');
        row.querySelectorAll('input').forEach(i => i.readOnly = false);
        row.querySelector('select').disabled = false;
        row.querySelector('.expense-amount-editable').style.display = 'block';
        row.querySelector('.expense-amount-display').style.display = 'none';
        
        // Change edit button to checkmark
        row.querySelector('.edit-expense-btn svg').innerHTML = `
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        `;
        
        row.querySelector('.expense-name-editable').focus();
    },

    // ===================================
    // RENDER STATS (Total Spend, Needs/Wants, Safe-to-Spend)
    // ===================================
    renderStats(totalSpend, income, categoryTotals) {
        const totalSpendEl = document.getElementById('total-monthly-spend');
        if (!totalSpendEl) return;

        totalSpendEl.textContent = core.formatCurrency(totalSpend);
        
        // Update total spend progress bar
        const spendProgressBar = document.getElementById('spend-progress-bar');
        const spendProgressText = document.getElementById('spend-progress-text');
        
        if (spendProgressBar && spendProgressText) {
            const percent = income > 0 ? (totalSpend / income) * 100 : 0;
            const cappedPercent = Math.min(percent, 100);
            
            spendProgressBar.style.width = `${cappedPercent}%`;
            spendProgressText.textContent = `${percent.toFixed(1)}% of Income`;
            
            spendProgressBar.className = 'h-full rounded-full transition-all duration-500';
            
            if (percent < 70) {
                spendProgressBar.classList.add('bg-emerald-500');
            } else if (percent <= 95) {
                spendProgressBar.classList.add('bg-amber-500');
            } else {
                spendProgressBar.classList.add('bg-red-500');
            }
        }
        
        // Get budget percentages
        const needsInput = document.getElementById('input-needs');
        const wantsInput = document.getElementById('input-wants');
        const savingsInput = document.getElementById('input-savings');
        
        const needsPercent = needsInput ? parseInt(needsInput.value) : 50;
        const wantsPercent = wantsInput ? parseInt(wantsInput.value) : 30;
        const savingsPercent = savingsInput ? parseInt(savingsInput.value) : 20;

        const needsBudget = income * (needsPercent / 100);
        const wantsBudget = income * (wantsPercent / 100);
        const savingsBudget = income * (savingsPercent / 100);

        // ✅ Calculate actual spending by budget type
        let needsSpent = 0;
        let wantsSpent = 0;
        
        if (categoryTotals) {
            Object.keys(categoryTotals).forEach(category => {
                const budgetType = getCategoryBudgetType(category);
                if (budgetType === 'needs') {
                    needsSpent += categoryTotals[category];
                } else if (budgetType === 'wants') {
                    wantsSpent += categoryTotals[category];
                }
            });
        }

        // Update Needs Progress Bar
        const needsAmountEl = document.getElementById('needs-spent-amount');
        const needsProgressFill = document.getElementById('needs-progress-fill');
        const needsBudgetEl = document.getElementById('needs-budget-limit');
        
        if (needsAmountEl && needsProgressFill && needsBudgetEl) {
            needsAmountEl.textContent = core.formatCurrency(needsSpent);
            needsBudgetEl.textContent = core.formatCurrency(needsBudget);
            
            const needsProgressPercent = needsBudget > 0 ? Math.min((needsSpent / needsBudget) * 100, 100) : 0;
            needsProgressFill.style.width = `${needsProgressPercent}%`;
            
            needsProgressFill.className = 'h-full rounded-full transition-all duration-500';
            if (needsSpent > needsBudget) {
                needsProgressFill.classList.add('bg-red-500');
            } else if (needsSpent >= needsBudget * 0.9) {
                needsProgressFill.classList.add('bg-amber-500');
            } else {
                needsProgressFill.classList.add('bg-emerald-500');
            }
        }

        // Update Wants Progress Bar
        const wantsAmountEl = document.getElementById('wants-spent-amount');
        const wantsProgressFill = document.getElementById('wants-progress-fill');
        const wantsBudgetEl = document.getElementById('wants-budget-limit');
        
        if (wantsAmountEl && wantsProgressFill && wantsBudgetEl) {
            wantsAmountEl.textContent = core.formatCurrency(wantsSpent);
            wantsBudgetEl.textContent = core.formatCurrency(wantsBudget);
            
            const wantsProgressPercent = wantsBudget > 0 ? Math.min((wantsSpent / wantsBudget) * 100, 100) : 0;
            wantsProgressFill.style.width = `${wantsProgressPercent}%`;
            
            wantsProgressFill.className = 'h-full rounded-full transition-all duration-500';
            if (wantsSpent > wantsBudget) {
                wantsProgressFill.classList.add('bg-red-500');
            } else if (wantsSpent >= wantsBudget * 0.9) {
                wantsProgressFill.classList.add('bg-amber-500');
            } else {
                wantsProgressFill.classList.add('bg-blue-500');
            }
        }
        
        // Calculate Safe-to-Spend
        const safeToSpend = (income - needsBudget - savingsBudget) - wantsSpent;
        
        const safeToSpendEl = document.getElementById('safe-to-spend');
        if (safeToSpendEl) {
            safeToSpendEl.textContent = core.formatCurrency(Math.max(0, safeToSpend));
        }
        
        // Update Daily Allowance
        const daysLeft = getDaysRemainingInMonth(this.state.selectedYear, this.state.selectedMonth);
        const dailyAllowance = document.getElementById('daily-allowance');
        const daysRemaining = document.getElementById('days-remaining');
        
        if (dailyAllowance) {
            dailyAllowance.textContent = core.formatCurrency(safeToSpend > 0 && daysLeft > 0 ? safeToSpend / daysLeft : 0);
        }
        if (daysRemaining) {
            daysRemaining.textContent = daysLeft > 0 
                ? `${daysLeft} days left this month` 
                : 'Month has ended';
        }
    },

    // ===================================
    // RENDER DONUT CHART
    // ===================================
    renderDonutChart(categoryTotals, totalSpend, income, expenses) {
        const innerSegments = document.getElementById('donut-inner-segments');
        const outerSegments = document.getElementById('donut-outer-segments');
        const legend = document.getElementById('category-legend');
        
        if (!innerSegments) return;

        innerSegments.innerHTML = '';
        outerSegments.innerHTML = '';
        legend.innerHTML = '';
        
        const donutTotal = document.getElementById('donut-total');
        if (donutTotal) {
            donutTotal.textContent = core.formatCurrency(totalSpend);
        }
        
        if (totalSpend === 0) {
            legend.innerHTML = '<div class="text-center text-zinc-500 text-sm py-8">No expenses to display</div>';
            return;
        }
        
        const categories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);
        
        let currentAngle = 0;
        
        categories.forEach((category) => {
            const catSpend = categoryTotals[category];
            const catSweep = (catSpend / totalSpend) * 360;
            const color = getCategoryColor(category);
            
            // Draw Inner Ring (Main Category)
            if (catSweep > 0) {
                const innerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                innerPath.setAttribute('d', describeArc(180, 180, 100, currentAngle, currentAngle + catSweep));
                innerPath.setAttribute('fill', 'none');
                innerPath.setAttribute('stroke', color);
                innerPath.setAttribute('stroke-width', 40);
                innerPath.classList.add('donut-segment');
                innerPath.setAttribute('data-category', category);
                innerSegments.appendChild(innerPath);
            }

            // Draw Outer Ring (Individual Expenses)
            const catExpenses = expenses.filter(e => e.category === category).sort((a, b) => b.amount - a.amount);
            let outerAngle = currentAngle;

            catExpenses.forEach((exp, index) => {
                const expSweep = (exp.amount / totalSpend) * 360;
                
                if (expSweep > 0) {
                    const opacity = 1 - (index % 3) * 0.25; 
                    
                    const outerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    outerPath.setAttribute('d', describeArc(180, 180, 145, outerAngle, outerAngle + expSweep));
                    outerPath.setAttribute('fill', 'none');
                    outerPath.setAttribute('stroke', color);
                    outerPath.setAttribute('stroke-width', 30);
                    outerPath.style.opacity = opacity.toString();
                    outerPath.classList.add('donut-segment');
                    outerPath.setAttribute('data-category', category);
                    outerSegments.appendChild(outerPath);
                    
                    outerAngle += expSweep;
                }
            });

            currentAngle += catSweep;
            
            // Render Legend
            const budgetType = getCategoryBudgetType(category);
            let budgetPercent = 0;
            const needsInput = document.getElementById('input-needs');
            const wantsInput = document.getElementById('input-wants');
            
            if (budgetType === 'needs' && needsInput) {
                const needsTotal = parseInt(needsInput.value);
                const needsCount = categories.filter(c => getCategoryBudgetType(c) === 'needs').length;
                budgetPercent = needsCount > 0 ? needsTotal / needsCount : 0; 
            } else if (budgetType === 'wants' && wantsInput) {
                const wantsTotal = parseInt(wantsInput.value);
                const wantsCount = categories.filter(c => getCategoryBudgetType(c) === 'wants').length;
                budgetPercent = wantsCount > 0 ? wantsTotal / wantsCount : 0; 
            }
            
            const budgetAmount = income * budgetPercent / 100;
            
            let budgetStatus = 'under-budget';
            if (catSpend > budgetAmount) {
                budgetStatus = 'over-budget';
            } else if (catSpend >= budgetAmount * 0.9) {
                budgetStatus = 'at-budget';
            }
            
            const progressPercent = budgetAmount > 0 ? Math.min((catSpend / budgetAmount) * 100, 100) : 0;
            const displayLabel = getCategoryLabel(category);
            const percentOfTotal = (catSpend / totalSpend) * 100;
            
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            
            legendItem.innerHTML = `
                <div class="legend-item-header">
                    <div class="legend-color" style="background: ${color};"></div>
                    <div class="legend-text">${displayLabel}</div>
                    <div class="legend-percentage">${percentOfTotal.toFixed(1)}%</div>
                    <div class="legend-amount">${core.formatCurrency(catSpend)}</div>
                </div>
                ${budgetAmount > 0 ? `
                    <div class="budget-progress">
                        <div class="budget-progress-bar">
                            <div class="budget-progress-fill ${budgetStatus}" style="width: ${progressPercent}%;"></div>
                        </div>
                        <div class="budget-info" style="justify-content: flex-end;">
                            <span class="budget-limit">Limit: ${core.formatCurrency(budgetAmount)}</span>
                        </div>
                    </div>
                ` : ''}
            `;
            
            // Add hover effects
            legendItem.addEventListener('mouseenter', () => {
                document.querySelectorAll('.donut-segment').forEach(segment => {
                    if (segment.getAttribute('data-category') === category) {
                        segment.classList.add('glow');
                        segment.classList.remove('dim');
                    } else {
                        segment.classList.add('dim');
                        segment.classList.remove('glow');
                    }
                });
            });

            legendItem.addEventListener('mouseleave', () => {
                document.querySelectorAll('.donut-segment').forEach(segment => {
                    segment.classList.remove('glow', 'dim');
                });
            });
            
            legend.appendChild(legendItem);
        });
    }
};
