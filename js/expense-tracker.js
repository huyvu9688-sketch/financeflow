import { Database } from './database.js';

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ✅ Fixed color mapping per category
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

function getDaysRemainingInMonth(year, month) {
    const lastDay = new Date(year, month + 1, 0);
    const now = new Date();
    if (year === now.getFullYear() && month === now.getMonth()) {
        return lastDay.getDate() - now.getDate() + 1;
    }
    return lastDay.getDate();
}

// Core API reference
let core = {};

export const ExpenseTracker = {
    state: {
        selectedMonth: new Date().getMonth(),
        selectedYear: new Date().getFullYear(),
        currentFilter: 'all',
        currentSearchTerm: ''
    },

    init(coreFunctions) {
        core = coreFunctions;
        
        const expModal = document.getElementById('expense-modal');
        const trackingCard = document.getElementById('expense-tracking-card');
        
        if (!expModal || !trackingCard) {
            console.warn("Expense modal HTML missing. Skipping init.");
            return;
        }

        // Setup event listeners
        const searchInput = document.getElementById('expense-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.state.currentSearchTerm = e.target.value.toLowerCase();
                this.update();
            });
        }

        const categoryFilter = document.getElementById('category-filter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.state.currentFilter = e.target.value;
                this.update();
            });
        }

        const monthPicker = document.getElementById('month-picker');
        if (monthPicker) {
            monthPicker.value = `${this.state.selectedYear}-${String(this.state.selectedMonth + 1).padStart(2, '0')}`;
            monthPicker.addEventListener('change', (e) => {
                const [year, month] = e.target.value.split('-');
                this.state.selectedYear = parseInt(year);
                this.state.selectedMonth = parseInt(month) - 1;
                
                const monthLabel = document.getElementById('current-month');
                if (monthLabel) {
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                       'July', 'August', 'September', 'October', 'November', 'December'];
                    monthLabel.textContent = monthNames[this.state.selectedMonth];
                }
                
                this.update();
            });
        }

        trackingCard.addEventListener('click', () => {
            expModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            this.update();
        });

        const closeBtn = document.getElementById('close-expense-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                expModal.classList.remove('active');
                document.body.style.overflow = 'auto';
            });
        }
    },

    update() {
        const expenses = core.getExpenses();
        const income = core.getIncome();
        
        // Filter by selected month/year
        const filtered = expenses.filter(exp => {
            const expDate = new Date(exp.date);
            return expDate.getMonth() === this.state.selectedMonth && 
                   expDate.getFullYear() === this.state.selectedYear;
        }).filter(exp => {
            // Apply search and category filters
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
        
        // Render all sections
        this.renderHistoryList(filtered);
        this.renderDonutChart(categoryTotals, totalSpend, income);
        this.renderStats(totalSpend, income);
    },

    renderHistoryList(expenses) {
        const historyList = document.getElementById('expense-history-list');
        if (!historyList) return;

        if (expenses.length === 0) {
            historyList.innerHTML = '<div class="text-center text-zinc-500 text-sm py-8">No expenses found</div>';
            return;
        }
        
        historyList.innerHTML = '';
        const currency = core.getCurrency();
        
        expenses.forEach(exp => {
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
                            <option value="housing" ${exp.category === 'housing' ? 'selected' : ''}>Housing</option>
                            <option value="food" ${exp.category === 'food' ? 'selected' : ''}>Food & Dining</option>
                            <option value="transportation" ${exp.category === 'transportation' ? 'selected' : ''}>Transportation</option>
                            <option value="entertainment" ${exp.category === 'entertainment' ? 'selected' : ''}>Entertainment</option>
                            <option value="healthcare" ${exp.category === 'healthcare' ? 'selected' : ''}>Healthcare</option>
                            <option value="shopping" ${exp.category === 'shopping' ? 'selected' : ''}>Shopping</option>
                            <option value="utilities" ${exp.category === 'utilities' ? 'selected' : ''}>Utilities</option>
                            <option value="other" ${exp.category === 'other' ? 'selected' : ''}>Other</option>
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

        // Attach event listeners to buttons after a slight delay
        setTimeout(() => {
            this.attachRowEventListeners();
        }, 100);
    },

    attachRowEventListeners() {
        // Edit buttons
        document.querySelectorAll('.edit-expense-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                this.toggleEdit(id);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-expense-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (confirm('Are you sure you want to delete this expense?')) {
                    const id = btn.getAttribute('data-id');
                    await this.deleteExpense(id);
                }
            });
        });
    },

    async deleteExpense(id) {
        try {
            const user = core.getUser();
            
            core.showSync();
            
            // Delete from database if user is logged in
            if (user) {
                await Database.deleteExpense(user.uid, id);
            }
            
            // Update local cache
            let expenses = core.getExpenses().filter(exp => exp.id !== id);
            core.setExpenses(expenses);
            
            core.hideSync();
            
            // Re-render expense tracker
            this.update();
            
            // Update monthly chart
            if (window.refreshMonthlyChartAfterExpenseChange) {
                window.refreshMonthlyChartAfterExpenseChange();
            }
        } catch (error) {
            console.error('Error deleting expense:', error);
            core.hideSync();
            alert('Failed to delete expense. Please try again.');
        }
    },

    async toggleEdit(id) {
        const row = document.querySelector(`.expense-history-item[data-id="${id}"]`);
        if (!row) return;
        
        if (row.classList.contains('editing')) {
            // SAVE MODE
            await this.saveEdit(id, row);
        } else {
            // EDIT MODE
            this.enableEditMode(id, row);
        }
    },

    async saveEdit(id, row) {
        try {
            const name = row.querySelector('.expense-name-editable').value.trim();
            const category = row.querySelector('.expense-category-editable').value;
            let amount = parseFloat(row.querySelector('.expense-amount-editable').value);
            
            // Validation
            if (!name || isNaN(amount) || amount <= 0) {
                alert('Please enter valid expense details');
                return;
            }
            
            // Convert back to base currency if VND
            if (core.getCurrency() === 'VND') {
                amount *= 1000;
            }
            
            const user = core.getUser();
            
            core.showSync();
            
            // Update in database if user is logged in
            if (user) {
                await Database.updateExpense(user.uid, id, { name, category, amount });
            }
            
            // Update local cache
            let expenses = core.getExpenses();
            const index = expenses.findIndex(e => e.id === id);
            if (index !== -1) {
                expenses[index] = { ...expenses[index], name, category, amount };
            }
            core.setExpenses(expenses);
            
            core.hideSync();
            
            // Re-render expense tracker
            this.update();
            
            // Update monthly chart
            if (window.refreshMonthlyChartAfterExpenseChange) {
                window.refreshMonthlyChartAfterExpenseChange();
            }
        } catch (error) {
            console.error('Error updating expense:', error);
            core.hideSync();
            alert('Failed to update expense. Please try again.');
        }
    },

    enableEditMode(id, row) {
        // Cancel any other editing rows first
        document.querySelectorAll('.expense-history-item.editing').forEach(r => {
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
        
        // Enable editing for this row
        row.classList.add('editing');
        row.querySelectorAll('input').forEach(i => i.readOnly = false);
        row.querySelector('select').disabled = false;
        row.querySelector('.expense-amount-editable').style.display = 'block';
        row.querySelector('.expense-amount-display').style.display = 'none';
        
        // Change edit icon to checkmark
        row.querySelector('.edit-expense-btn svg').innerHTML = `
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        `;
        
        // Focus on name input
        row.querySelector('.expense-name-editable').focus();
    },

    renderStats(totalSpend, income) {
        const totalSpendEl = document.getElementById('total-monthly-spend');
        if (!totalSpendEl) return;

        totalSpendEl.textContent = core.formatCurrency(totalSpend);
        
        // Income vs Expense bars
        const maxAmount = Math.max(income, totalSpend);
        const incomeBar = document.getElementById('income-bar');
        const expenseBar = document.getElementById('expense-bar');
        
        if (incomeBar) incomeBar.style.width = `${(income / maxAmount) * 100}%`;
        if (expenseBar) expenseBar.style.width = `${(totalSpend / maxAmount) * 100}%`;
        
        const incomeAmount = document.getElementById('income-amount');
        const expenseAmount = document.getElementById('expense-amount');
        
        if (incomeAmount) incomeAmount.textContent = core.formatCurrency(income);
        if (expenseAmount) expenseAmount.textContent = core.formatCurrency(totalSpend);
        
        // Safe-to-spend calculation
        const savingsInput = document.getElementById('input-savings');
        const savingsPercent = savingsInput ? parseInt(savingsInput.value) : 20;
        const safeToSpend = income - totalSpend - (income * savingsPercent / 100);
        
        const safeToSpendEl = document.getElementById('safe-to-spend');
        if (safeToSpendEl) {
            safeToSpendEl.textContent = core.formatCurrency(Math.max(0, safeToSpend));
        }
        
        // Daily allowance
        const daysLeft = getDaysRemainingInMonth(this.state.selectedYear, this.state.selectedMonth);
        const dailyAllowance = document.getElementById('daily-allowance');
        const daysRemaining = document.getElementById('days-remaining');
        
        if (dailyAllowance) {
            dailyAllowance.textContent = core.formatCurrency(safeToSpend > 0 ? safeToSpend / daysLeft : 0);
        }
        if (daysRemaining) {
            daysRemaining.textContent = `${daysLeft} days left this month`;
        }
    },

    renderDonutChart(categoryTotals, totalSpend, income) {
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
        
        // Sort categories by spending
        const categories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);
        
        let startInnerAngle = 0;
        let startOuterAngle = 0;
        
        categories.forEach((category, index) => {
            const spend = categoryTotals[category];
            const percent = (spend / totalSpend) * 100;
            const color = getCategoryColor(category); // ✅ Use fixed color
            
            // Determine budget category
            const needsCategories = ['housing', 'food', 'transportation', 'healthcare', 'utilities'];
            const wantsCategories = ['entertainment', 'shopping', 'other'];
            
            let budgetPercent = 0;
            const needsInput = document.getElementById('input-needs');
            const wantsInput = document.getElementById('input-wants');
            
            if (needsCategories.includes(category.toLowerCase()) && needsInput) {
                budgetPercent = parseInt(needsInput.value);
            } else if (wantsCategories.includes(category.toLowerCase()) && wantsInput) {
                budgetPercent = parseInt(wantsInput.value);
            }
            
            const budgetAmount = income * budgetPercent / 100;
            
            // Draw inner ring (actual spending)
            const innerSweep = (percent / 100) * 360;
            const innerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            innerPath.setAttribute('d', describeArc(180, 180, 100, startInnerAngle, startInnerAngle + innerSweep));
            innerPath.setAttribute('fill', 'none');
            innerPath.setAttribute('stroke', color);
            innerPath.setAttribute('stroke-width', 40);
            innerSegments.appendChild(innerPath);
            startInnerAngle += innerSweep;
            
            // Draw outer ring (budget) if budget exists
            if (budgetAmount > 0) {
                const budgetSweep = (budgetAmount / income) * 360;
                const outerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                outerPath.setAttribute('d', describeArc(180, 180, 145, startOuterAngle, startOuterAngle + budgetSweep));
                outerPath.setAttribute('fill', 'none');
                outerPath.setAttribute('stroke', color);
                outerPath.setAttribute('stroke-width', 30);
                outerPath.style.opacity = '0.4';
                outerSegments.appendChild(outerPath);
                startOuterAngle += budgetSweep;
            }
            
            // Determine budget status
            let budgetStatus = 'under-budget';
            if (spend > budgetAmount) {
                budgetStatus = 'over-budget';
            } else if (spend >= budgetAmount * 0.9) {
                budgetStatus = 'at-budget';
            }
            
            const progressPercent = budgetAmount > 0 ? Math.min((spend / budgetAmount) * 100, 100) : 0;
            
            // Create legend item
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.innerHTML = `
                <div class="legend-item-header">
                    <div class="legend-color" style="background: ${color};"></div>
                    <div class="legend-text">${category}</div>
                    <div class="legend-percentage">${percent.toFixed(1)}%</div>
                    <div class="legend-amount">${core.formatCurrency(spend)}</div>
                </div>
                ${budgetAmount > 0 ? `
                    <div class="budget-progress">
                        <div class="budget-progress-bar">
                            <div class="budget-progress-fill ${budgetStatus}" style="width: ${progressPercent}%;"></div>
                        </div>
                        <div class="budget-info">
                            <span class="budget-spent">${core.formatCurrency(spend)} spent</span>
                            <span class="budget-limit">${core.formatCurrency(budgetAmount)} budget</span>
                        </div>
                    </div>
                ` : ''}
            `;
            
            legend.appendChild(legendItem);
        });
    }
};
