import { Database } from './database.js';

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function getPastelRainbowColor(position) { return `hsl(${position * 360}, 70%, 75%)`; }
function polarToCartesian(centerX, centerY, radius, angleInDegrees) { const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0; return { x: centerX + (radius * Math.cos(angleInRadians)), y: centerY + (radius * Math.sin(angleInRadians)) }; }
function describeArc(x, y, radius, startAngle, endAngle) { const gapSize = 0.5; const adjustedStartAngle = startAngle + gapSize; const adjustedEndAngle = endAngle - gapSize; const start = polarToCartesian(x, y, radius, adjustedEndAngle); const end = polarToCartesian(x, y, radius, adjustedStartAngle); const largeArcFlag = (adjustedEndAngle - adjustedStartAngle) <= 180 ? "0" : "1"; return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(" "); }
function getDaysRemainingInMonth(year, month) { const lastDay = new Date(year, month + 1, 0); const now = new Date(); if (year === now.getFullYear() && month === now.getMonth()) { return lastDay.getDate() - now.getDate() + 1; } return lastDay.getDate(); }

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

        document.getElementById('expense-search').addEventListener('input', (e) => { this.state.currentSearchTerm = e.target.value.toLowerCase(); this.update(); });
        document.getElementById('category-filter').addEventListener('change', (e) => { this.state.currentFilter = e.target.value; this.update(); });
        
        const mPicker = document.getElementById('month-picker');
        if(mPicker) {
            mPicker.value = `${this.state.selectedYear}-${String(this.state.selectedMonth + 1).padStart(2, '0')}`;
            mPicker.addEventListener('change', (e) => {
                const [y, m] = e.target.value.split('-');
                this.state.selectedYear = parseInt(y); this.state.selectedMonth = parseInt(m) - 1;
                document.getElementById('current-month').textContent = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][this.state.selectedMonth];
                this.update();
            });
        }

        trackingCard.addEventListener('click', () => { expModal.classList.add('active'); this.update(); });
        document.getElementById('close-expense-modal').addEventListener('click', () => expModal.classList.remove('active'));
    },

    update() {
        const expenses = core.getExpenses();
        const income = core.getIncome();
        
        const filtered = expenses.filter(exp => {
            const expDate = new Date(exp.date);
            return expDate.getMonth() === this.state.selectedMonth && expDate.getFullYear() === this.state.selectedYear;
        }).filter(exp => {
            const matchesSearch = exp.name.toLowerCase().includes(this.state.currentSearchTerm);
            const matchesCategory = this.state.currentFilter === 'all' || exp.category === this.state.currentFilter;
            return matchesSearch && matchesCategory;
        });
        
        const categoryTotals = {};
        let totalSpend = 0;
        filtered.forEach(exp => {
            if (!categoryTotals[exp.category]) categoryTotals[exp.category] = 0;
            categoryTotals[exp.category] += exp.amount;
            totalSpend += exp.amount;
        });
        
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
                        <span>•</span><span>${new Date(exp.date).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="text-right">
                        <input type="number" class="expense-amount-editable" value="${displayInputValue}" data-id="${exp.id}" step="${currency === 'USD' ? '0.01' : '1'}" readonly style="display: none;">
                        <div class="expense-amount-display" data-id="${exp.id}">${formattedAmount}</div>
                    </div>
                    <div class="action-buttons">
                        <button class="edit-expense-btn" data-id="${exp.id}" type="button" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="delete-expense-btn" data-id="${exp.id}" type="button" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            `;
            historyList.appendChild(row);
        });

        setTimeout(() => {
            document.querySelectorAll('.edit-expense-btn').forEach(btn => {
                btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleEdit(btn.getAttribute('data-id')); });
            });
            document.querySelectorAll('.delete-expense-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => { 
                    e.preventDefault(); e.stopPropagation(); 
                    if(confirm('Delete this expense?')) {
                        const id = btn.getAttribute('data-id');
                        core.showSync();
                        await Database.deleteExpense(id);
                        
                        let expenses = core.getExpenses().filter(exp => exp.id !== id);
                        core.setExpenses(expenses);
                        
                        core.hideSync();
                        this.update(); 
                    }
                });
            });
        }, 100);
    },

    async toggleEdit(id) {
        const row = document.querySelector(`.expense-history-item[data-id="${id}"]`);
        if (!row) return;
        
        if (row.classList.contains('editing')) {
            const name = row.querySelector('.expense-name-editable').value.trim();
            const category = row.querySelector('.expense-category-editable').value;
            let amount = parseFloat(row.querySelector('.expense-amount-editable').value);
            
            if (!name || isNaN(amount) || amount <= 0) return alert('Invalid input');
            if (core.getCurrency() === 'VND') amount *= 1000;
            
            core.showSync();
            await Database.updateExpense(id, { name, category, amount });
            
            let expenses = core.getExpenses();
            const idx = expenses.findIndex(e => e.id === id);
            if(idx !== -1) { expenses[idx] = { ...expenses[idx], name, category, amount }; }
            core.setExpenses(expenses);
            
            core.hideSync();
            this.update(); 
        } else {
            document.querySelectorAll('.expense-history-item.editing').forEach(r => {
                r.classList.remove('editing');
                r.querySelectorAll('input').forEach(i => i.readOnly = true);
                r.querySelector('select').disabled = true;
                r.querySelector('.expense-amount-editable').style.display = 'none';
                r.querySelector('.expense-amount-display').style.display = 'block';
                r.querySelector('.edit-expense-btn svg').innerHTML = '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>';
            });
            
            row.classList.add('editing');
            row.querySelectorAll('input').forEach(i => i.readOnly = false);
            row.querySelector('select').disabled = false;
            row.querySelector('.expense-amount-editable').style.display = 'block';
            row.querySelector('.expense-amount-display').style.display = 'none';
            row.querySelector('.edit-expense-btn svg').innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
            row.querySelector('.expense-name-editable').focus();
        }
    },

    renderStats(totalSpend, income) {
        const totalSpendEl = document.getElementById('total-monthly-spend');
        if(!totalSpendEl) return;

        totalSpendEl.textContent = core.formatCurrency(totalSpend);
        const maxAmount = Math.max(income, totalSpend);
        document.getElementById('income-bar').style.width = `${(income / maxAmount) * 100}%`;
        document.getElementById('expense-bar').style.width = `${(totalSpend / maxAmount) * 100}%`;
        document.getElementById('income-amount').textContent = core.formatCurrency(income);
        document.getElementById('expense-amount').textContent = core.formatCurrency(totalSpend);
        
        const savingsPercent = parseInt(document.getElementById('input-savings').value);
        const safeToSpend = income - totalSpend - (income * savingsPercent / 100);
        document.getElementById('safe-to-spend').textContent = core.formatCurrency(Math.max(0, safeToSpend));
        
        const daysLeft = getDaysRemainingInMonth(this.state.selectedYear, this.state.selectedMonth);
        document.getElementById('daily-allowance').textContent = core.formatCurrency(safeToSpend > 0 ? safeToSpend / daysLeft : 0);
        document.getElementById('days-remaining').textContent = `${daysLeft} days left this month`;
    },

    renderDonutChart(categoryTotals, totalSpend, income) {
        const innerSegments = document.getElementById('donut-inner-segments');
        const outerSegments = document.getElementById('donut-outer-segments');
        const legend = document.getElementById('category-legend');
        if(!innerSegments) return;

        innerSegments.innerHTML = ''; outerSegments.innerHTML = ''; legend.innerHTML = '';
        document.getElementById('donut-total').textContent = core.formatCurrency(totalSpend);
        
        if (totalSpend === 0) {
            legend.innerHTML = '<div class="text-center text-zinc-500 text-sm py-8">No expenses to display</div>';
            return;
        }
        
        const categories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);
        let startInner = 0, startOuter = 0;
        
        categories.forEach((category, i) => {
            const spend = categoryTotals[category];
            const percent = (spend / totalSpend) * 100;
            const color = getPastelRainbowColor(i / categories.length);
            
            const nCats = ['housing', 'food', 'transportation', 'healthcare', 'utilities'];
            const wCats = ['entertainment', 'shopping', 'other'];
            const bPercent = nCats.includes(category.toLowerCase()) ? parseInt(document.getElementById('input-needs').value) : (wCats.includes(category.toLowerCase()) ? parseInt(document.getElementById('input-wants').value) : 0);
            const bAmount = income * bPercent / 100;
            
            const innerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            innerPath.setAttribute('d', describeArc(180, 180, 100, startInner, startInner + (percent/100)*360));
            innerPath.setAttribute('fill', 'none'); innerPath.setAttribute('stroke', color); innerPath.setAttribute('stroke-width', 40);
            innerSegments.appendChild(innerPath);
            
            if (bAmount > 0) {
                const bSweep = (bAmount / income) * 360;
                const outerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                outerPath.setAttribute('d', describeArc(180, 180, 145, startOuter, startOuter + bSweep));
                outerPath.setAttribute('fill', 'none'); outerPath.setAttribute('stroke', color); outerPath.setAttribute('stroke-width', 30); outerPath.style.opacity = '0.4';
                outerSegments.appendChild(outerPath);
                startOuter += bSweep;
            }
            
            const bStatus = spend > bAmount ? 'over-budget' : (spend >= bAmount * 0.9 ? 'at-budget' : 'under-budget');
            const pPercent = bAmount > 0 ? Math.min((spend / bAmount) * 100, 100) : 0;
            
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `
                <div class="legend-item-header">
                    <div class="legend-color" style="background: ${color};"></div>
                    <div class="legend-text">${category}</div>
                    <div class="legend-percentage">${percent.toFixed(1)}%</div>
                    <div class="legend-amount">${core.formatCurrency(spend)}</div>
                </div>
                ${bAmount > 0 ? `<div class="budget-progress"><div class="budget-progress-bar"><div class="budget-progress-fill ${bStatus}" style="width: ${pPercent}%;"></div></div><div class="budget-info"><span class="budget-spent">${core.formatCurrency(spend)} spent</span><span class="budget-limit">${core.formatCurrency(bAmount)} budget</span></div></div>` : ''}
            `;
            legend.appendChild(item);
            startInner += (percent/100)*360;
        });
    }
};
