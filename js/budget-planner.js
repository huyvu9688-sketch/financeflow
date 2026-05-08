import { Database } from './database.js';

function escapeHtml(text) { 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

let core = {};

// 1. Start completely empty - data will come from Firebase
let customFunds = [];
let simulatedData = {};

let editingFundId = null;
let selectedFundId = null;

export const BudgetPlanner = {
    init(coreFunctions) {
        core = coreFunctions;

        const modal = document.getElementById('budget-modal');
        if (!modal) return;

        const self = this;

        // Modal trigger
        const trigger = document.getElementById('budget-planning-trigger');
        if(trigger) {
            trigger.addEventListener('click', () => {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
                
                // Auto-select first fund if none selected
                if(!selectedFundId && customFunds.length > 0) {
                    selectedFundId = customFunds[0].id;
                }
                
                self.renderFundsList();
                if(selectedFundId) self.renderChartForFund(selectedFundId); 
                self.updateSavingsGoalBox();
            });
        }

        // Close modal
        const closeBtn = document.getElementById('close-budget-modal');
        if(closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
                document.body.style.overflow = 'auto';
                
                if(window.budgetChart) {
                    window.budgetChart.destroy();
                    window.budgetChart = null;
                }
                self.resetSimUI();
            });
        }

        // Add / Edit Fund Form Submit
        const form = document.getElementById('custom-fund-form');
        if(form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                if(!core.getUser || !core.getUser()) {
                    alert('Please log in to save funds.');
                    return;
                }

                const name = document.getElementById('cf-name').value.trim();
                const months = parseInt(document.getElementById('cf-months').value);
                const amount = parseFloat(document.getElementById('cf-amount').value);

                if(!name || isNaN(months) || isNaN(amount)) return;

                if(editingFundId) {
                    const fund = customFunds.find(f => f.id === editingFundId);
                    if(fund) {
                        fund.name = name;
                        fund.months = months;
                        fund.amount = amount;
                    }
                    editingFundId = null;
                    document.getElementById('cf-submit-btn').textContent = 'Add';
                } else {
                    const newFund = {
                        id: Date.now().toString(),
                        name,
                        months,
                        amount,
                        createdAt: new Date().toISOString()
                    };
                    customFunds.push(newFund);
                    selectedFundId = newFund.id;
                }
                
                form.reset();
                
                // SAVE TO FIREBASE
                await self.saveFunds();
                
                self.renderFundsList();
                self.renderChartForFund(selectedFundId);
            });
        }

        // List Delegation
        const list = document.getElementById('custom-funds-list');
        if(list) {
            list.addEventListener('click', async (e) => {
                const btnEdit = e.target.closest('.edit-cf-btn');
                const btnDel = e.target.closest('.delete-cf-btn');
                const row = e.target.closest('.cf-item');

                if(btnDel) {
                    const id = btnDel.dataset.id;
                    if(confirm('Are you sure you want to delete this fund?')) {
                        customFunds = customFunds.filter(f => f.id !== id);
                        delete simulatedData[id];
                        
                        if(selectedFundId === id) {
                            selectedFundId = customFunds.length > 0 ? customFunds[0].id : null;
                        }
                        
                        // SAVE TO FIREBASE
                        await self.saveFunds();
                        
                        self.renderFundsList();
                        if(selectedFundId) {
                            self.renderChartForFund(selectedFundId);
                        } else if(window.budgetChart) {
                            window.budgetChart.destroy();
                            window.budgetChart = null;
                        }
                        
                        self.updateSavingsGoalBox();
                    }
                    return;
                }

                if(btnEdit) {
                    const id = btnEdit.dataset.id;
                    const fund = customFunds.find(f => f.id === id);
                    if(fund) {
                        document.getElementById('cf-name').value = fund.name;
                        document.getElementById('cf-months').value = fund.months;
                        document.getElementById('cf-amount').value = fund.amount;
                        editingFundId = id;
                        document.getElementById('cf-submit-btn').textContent = 'Save';
                    }
                    return;
                }

                if(row) {
                    selectedFundId = row.dataset.id;
                    self.resetSimUI();
                    self.renderFundsList();
                    self.renderChartForFund(selectedFundId);
                }
            });
        }

        // Trigger budget recalculation when month picker changes
        document.addEventListener('change', (e) => {
            if(e.target.id === 'sim-month') {
                self.updateSavingsGoalBox();
            }
        });

        // Bulletproof Event Delegation for Simulation Buttons
        document.addEventListener('click', (e) => {
            const addSimBtn = e.target.closest('#add-sim-btn');
            const editSimBtn = e.target.closest('#edit-sim-btn');
            const cancelSimBtn = e.target.closest('#cancel-sim-btn');

            if(addSimBtn || editSimBtn) {
                e.preventDefault();
                self.handleSimSubmit();
            }

            if(cancelSimBtn) {
                e.preventDefault();
                self.resetSimUI();
            }
        });
    },

    // --- FIREBASE SYNC METHODS RESTORED ---
    
    setFunds(funds) {
        customFunds = funds || [];
        if(customFunds.length > 0 && !selectedFundId) {
            selectedFundId = customFunds[0].id;
        }
    },

    setSimulatedData(data) {
        simulatedData = data || {};
    },

    async saveFunds() {
        if (core.getUser && core.getUser()) {
            const user = core.getUser();
            if (core.showSync) core.showSync();
            
            try {
                const budgetData = {
                    needs: parseInt(document.getElementById('input-needs')?.value || 50),
                    wants: parseInt(document.getElementById('input-wants')?.value || 30),
                    savings: parseInt(document.getElementById('input-savings')?.value || 20),
                    income: core.getIncome ? core.getIncome() : 0
                };
                
                await Database.saveBudget(
                    user.uid, 
                    budgetData, 
                    core.getCurrency ? core.getCurrency() : 'USD', 
                    customFunds, 
                    simulatedData
                );
            } catch (error) {
                console.error("Failed to save to Firebase:", error);
            } finally {
                if (core.hideSync) core.hideSync();
            }
        }
    },

    // --- END FIREBASE SYNC METHODS ---

    async handleSimSubmit() {
        if(!selectedFundId) {
            alert('Please select a fund first.');
            return;
        }
        
        if(!core.getUser || !core.getUser()) {
            alert('Please log in to save data.');
            return;
        }
        
        const monthVal = document.getElementById('sim-month').value;
        const amountVal = parseFloat(document.getElementById('sim-amount').value);
        
        if(!monthVal || isNaN(amountVal)) {
            alert('Please select a month and enter a valid amount.');
            return;
        }

        if(!simulatedData[selectedFundId]) {
            simulatedData[selectedFundId] = {};
        }
        
        simulatedData[selectedFundId][monthVal] = amountVal;
        
        // SAVE TO FIREBASE
        await this.saveFunds();
        
        this.resetSimUI();
        this.renderChartForFund(selectedFundId);
        this.updateSavingsGoalBox();
    },

    updateSavingsGoalBox() {
        const savingsInput = document.getElementById('input-savings');
        const leftBox = document.getElementById('modal-savings-left');
        const monthLabel = document.getElementById('modal-savings-month-label');
        const monthInput = document.getElementById('sim-month');
        
        if(!savingsInput || !leftBox || !core.getIncome) return;
        
        const savingsPct = parseInt(savingsInput.value) || 0;
        const income = core.getIncome();
        const totalBudget = income * (savingsPct / 100);
        
        let selectedMonthStr = monthInput ? monthInput.value : null;
        if(!selectedMonthStr) {
            const now = new Date();
            selectedMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        
        let totalAllocatedThisMonth = 0;
        for (const fundId in simulatedData) {
            if (simulatedData[fundId][selectedMonthStr]) {
                totalAllocatedThisMonth += simulatedData[fundId][selectedMonthStr];
            }
        }
        
        const remaining = totalBudget - totalAllocatedThisMonth;
        
        leftBox.textContent = core.formatCurrency ? core.formatCurrency(remaining) : remaining.toLocaleString();
        
        if (remaining < 0) {
            leftBox.className = 'text-xl text-red-400 font-mono font-medium';
        } else if (remaining === 0) {
            leftBox.className = 'text-xl text-zinc-400 font-mono font-medium';
        } else {
            leftBox.className = 'text-xl text-emerald-400 font-mono font-medium';
        }
        
        if (monthLabel && selectedMonthStr) {
            const [year, month] = selectedMonthStr.split('-');
            const date = new Date(year, parseInt(month) - 1, 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            monthLabel.textContent = `for ${monthName}`;
        }
    },

    resetSimUI() {
        const amountInput = document.getElementById('sim-amount');
        const monthInput = document.getElementById('sim-month');
        
        if(amountInput) amountInput.value = '';
        if(monthInput) monthInput.disabled = false;
        
        document.getElementById('add-sim-btn')?.classList.remove('hidden');
        document.getElementById('edit-sim-btn')?.classList.add('hidden');
        document.getElementById('cancel-sim-btn')?.classList.add('hidden');
    },

    renderFundsList() {
        const list = document.getElementById('custom-funds-list');
        if(!list) return;

        if(customFunds.length === 0) {
            list.innerHTML = '<div class="text-xs text-zinc-500 italic text-center py-4">No funds added yet.</div>';
            return;
        }

        list.innerHTML = customFunds.map(fund => {
            const isSelected = fund.id === selectedFundId;
            const borderClass = isSelected ? 'border-emerald-500/50 bg-white/5' : 'border-zinc-800/50 hover:bg-white/5';
            const formattedAmount = core.formatCurrency ? core.formatCurrency(fund.amount) : fund.amount.toLocaleString();

            return `
            <div class="cf-item flex items-center justify-between p-3 border ${borderClass} rounded-lg transition-colors cursor-pointer group" data-id="${fund.id}">
                <div class="flex-1 min-w-0">
                    <div class="text-sm text-white font-medium mb-1">${escapeHtml(fund.name)}</div>
                    <div class="text-xs text-zinc-500 truncate">
                        <span class="text-emerald-400 font-mono">${formattedAmount}</span>
                        <span class="mx-2">•</span>
                        <span>${fund.months} months</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="edit-cf-btn w-8 h-8 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 flex items-center justify-center transition-colors" data-id="${fund.id}" title="Edit">
                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                    </button>
                    <button class="delete-cf-btn w-8 h-8 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors" data-id="${fund.id}" title="Delete">
                        <iconify-icon icon="solar:trash-bin-minimalistic-linear"></iconify-icon>
                    </button>
                </div>
            </div>
            `;
        }).join('');
    },

    renderChartForFund(fundId) {
        const canvas = document.getElementById('budget-chart');
        if(!canvas) return;

        const fund = customFunds.find(f => f.id === fundId);
        if(!fund) return;

        if(window.budgetChart) {
            window.budgetChart.destroy();
        }

        const simMonthInput = document.getElementById('sim-month');
        const startDate = fund.createdAt ? new Date(fund.createdAt) : new Date();
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + fund.months - 1, 1);
        
        const startMonthStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
        const endMonthStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
        
        if(simMonthInput && !simMonthInput.disabled) {
            simMonthInput.min = startMonthStr;
            simMonthInput.max = endMonthStr;
            if(!simMonthInput.value || simMonthInput.value < startMonthStr || simMonthInput.value > endMonthStr) {
                simMonthInput.value = startMonthStr;
                this.updateSavingsGoalBox();
            }
        }

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const labels = [];
        const expectedData = [];
        const actualData = [];
        const monthKeys = []; 
        const monthlyDue = fund.amount / fund.months;
        
        const simData = simulatedData[fundId];
        const hasSimData = simData && Object.keys(simData).length > 0;
        
        let totalSaved = 0;

        for(let i = 0; i < fund.months; i++) {
            const stepDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
            const stepMonthStr = `${stepDate.getFullYear()}-${String(stepDate.getMonth() + 1).padStart(2, '0')}`;
            
            labels.push(monthNames[stepDate.getMonth()]);
            monthKeys.push(stepMonthStr);
            expectedData.push(monthlyDue);

            // If user added data, use it. Otherwise, stay at 0. NO DEMO DATA.
            if (hasSimData && simData[stepMonthStr] !== undefined) {
                const val = simData[stepMonthStr];
                actualData.push(val); 
                totalSaved += val;
            } else {
                actualData.push(0); 
            }
        }

        // ==========================================
        // UPDATE LEFT DONUT CHART (PROGRESS)
        // ==========================================
        const progressPercent = fund.amount > 0 ? Math.min((totalSaved / fund.amount) * 100, 100) : 0;
        
        const circle = document.getElementById('fund-progress-circle');
        if(circle) {
            const circumference = 2 * Math.PI * 100;
            const offset = circumference - (progressPercent / 100) * circumference;
            circle.style.strokeDashoffset = offset;
        }
        
        const percentEl = document.getElementById('fund-progress-percent');
        if(percentEl) percentEl.textContent = Math.round(progressPercent) + '%';
        
        const savedEl = document.getElementById('fund-saved-amount');
        const goalEl = document.getElementById('fund-goal-amount');
        if(savedEl) savedEl.textContent = core.formatCurrency ? core.formatCurrency(totalSaved) : totalSaved.toLocaleString();
        if(goalEl) goalEl.textContent = core.formatCurrency ? core.formatCurrency(fund.amount) : fund.amount.toLocaleString();

        // ==========================================
        // RENDER RIGHT CHART (CHART.JS)
        // ==========================================
        const ctx = canvas.getContext('2d');
        const self = this;

        window.budgetChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Actual Monthly Allocation',
                        data: actualData,
                        backgroundColor: (context) => {
                            const chart = context.chart;
                            const {ctx, chartArea} = chart;
                            if (!chartArea) return null;
                            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            gradient.addColorStop(0, 'rgba(16, 185, 129, 0.5)'); 
                            gradient.addColorStop(1, 'rgba(16, 185, 129, 0.05)');
                            return gradient;
                        },
                        borderColor: '#10b981',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#10b981',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 8
                    },
                    {
                        label: 'Target Monthly Due',
                        data: expectedData,
                        backgroundColor: 'transparent',
                        borderColor: '#FFB703',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0,
                        pointRadius: 0,
                        pointHoverRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 10, bottom: 10 } },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const datasetIndex = elements[0].datasetIndex;
                        if(datasetIndex === 0) { 
                            const index = elements[0].index;
                            const monthKey = monthKeys[index];
                            const amount = actualData[index];
                            
                            document.getElementById('sim-month').value = monthKey;
                            document.getElementById('sim-month').disabled = true; 
                            const amountInput = document.getElementById('sim-amount');
                            amountInput.value = amount;
                            amountInput.focus(); 
                            
                            document.getElementById('add-sim-btn').classList.add('hidden');
                            document.getElementById('edit-sim-btn').classList.remove('hidden');
                            document.getElementById('cancel-sim-btn').classList.remove('hidden');
                            
                            self.updateSavingsGoalBox();
                        }
                    }
                },
                plugins: {
                    title: { display: false },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#a1a1aa', font: { family: 'Inter, sans-serif', size: 12 }, usePointStyle: true, padding: 20 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(24, 24, 27, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#a1a1aa',
                        borderColor: 'rgba(63, 63, 70, 0.5)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (core && core.formatCurrency) {
                                    label += core.formatCurrency(context.parsed.y);
                                } else {
                                    label += '$' + context.parsed.y.toLocaleString();
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Timeline (Months)', color: '#71717a' },
                        grid: { color: 'rgba(63, 63, 70, 0.15)', drawBorder: false },
                        ticks: { color: '#a1a1aa' }
                    },
                    y: {
                        beginAtZero: true,
                        suggestedMax: monthlyDue * 1.5,
                        title: { display: true, text: 'Monthly Allocation Amount', color: '#71717a' },
                        grid: { color: 'rgba(63, 63, 70, 0.15)', drawBorder: false },
                        ticks: { 
                            color: '#a1a1aa',
                            callback: function(value) {
                                if (core && core.formatCurrency) {
                                    return core.formatCurrency(value);
                                }
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }
};

if (typeof window !== 'undefined') {
    window.BudgetPlanner = BudgetPlanner;
}
