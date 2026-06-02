// budget-planner.js
import { Database } from './database.js';
import { escapeHtml } from './utils.js';
import { getCategoryBudgetType } from './constants.js';

// ===================================
// STATE MANAGEMENT
// ===================================
let core = {};
let customFunds = [];
let simulatedData = {};
let editingFundId = null;
let selectedFundId = null;
let warningToastTimeout = null;

// ===================================
// BUDGET PLANNER MODULE
// ===================================
export const BudgetPlanner = {
    
    // ===============================
    // INITIALIZATION
    // ===============================
    init(coreFunctions) {
        core = coreFunctions;
        this.setupEventListeners();
    },

    // ===============================
    // EVENT LISTENERS SETUP
    // ===============================
    setupEventListeners() {
        const modal = document.getElementById('budget-modal');
        if (!modal) {
            console.warn("Budget modal HTML missing. Skipping init.");
            return;
        }

        this.setupModalTrigger(modal);
        this.setupCloseButton(modal);
        this.setupFundForm();
        this.setupFundListDelegation(modal);
        this.setupSimulationControls(modal);
        this.setupMonthPickerListener();
    },

    setupModalTrigger(modal) {
        const trigger = document.getElementById('budget-planning-trigger');
        if (trigger) {
            trigger.addEventListener('click', async () => {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
                
                await this.cleanupOrphanedAllocations();
                
                if (!selectedFundId && customFunds.length > 0) {
                    selectedFundId = customFunds[0].id;
                }
                
                this.renderFundsList();
                if (selectedFundId) this.renderChartForFund(selectedFundId);
                this.updateSavingsGoalBox();
            });
        }
    },

    setupCloseButton(modal) {
        const closeBtn = document.getElementById('close-budget-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
                document.body.style.overflow = 'auto';
                
                if (window.budgetChart) {
                    window.budgetChart.destroy();
                    window.budgetChart = null;
                }
                this.resetSimUI();
            });
        }
    },

    setupFundForm() {
        const form = document.getElementById('custom-fund-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!core.getUser || !core.getUser()) {
                if (core.showErrorToast) {
                    core.showErrorToast('Please log in to save funds');
                }
                return;
            }

            const name = document.getElementById('cf-name').value.trim();
            const months = parseInt(document.getElementById('cf-months').value);
            const amount = parseFloat(document.getElementById('cf-amount').value);

            if (!this.validateFundInput(name, months, amount)) return;

            try {
                if (editingFundId) {
                    await this.updateExistingFund(editingFundId, name, months, amount);
                } else {
                    await this.createNewFund(name, months, amount);
                }
                
                form.reset();
                this.renderFundsList();
                this.renderChartForFund(selectedFundId);
                this.updateSavingsGoalBox();
                
            } catch (error) {
                console.error('Error saving fund:', error);
                if (core.showErrorToast) {
                    core.showErrorToast('Failed to save fund. Please try again.');
                }
            }
        });
    },

    setupFundListDelegation(modal) {
        modal.addEventListener('click', async (e) => {
            const list = document.getElementById('custom-funds-list');
            if (!list || !list.contains(e.target)) return;
            
            const btnEdit = e.target.closest('.edit-cf-btn');
            const btnDel = e.target.closest('.delete-cf-btn');
            const row = e.target.closest('.cf-item');

            if (btnDel) {
                e.preventDefault();
                e.stopPropagation();
                await this.handleDeleteFund(btnDel.dataset.id);
                return;
            }

            if (btnEdit) {
                e.preventDefault();
                e.stopPropagation();
                this.handleEditFund(btnEdit.dataset.id);
                return;
            }

            if (row && !btnEdit && !btnDel) {
                selectedFundId = row.dataset.id;
                this.resetSimUI();
                this.renderFundsList();
                this.renderChartForFund(selectedFundId);
            }
        });
    },

    setupSimulationControls(modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'add-sim-btn' || e.target.id === 'edit-sim-btn') {
                e.preventDefault();
                e.stopPropagation();
                this.handleSimSubmit();
                return;
            }

            if (e.target.id === 'cancel-sim-btn') {
                e.preventDefault();
                e.stopPropagation();
                this.resetSimUI();
                return;
            }
        });
    },

    setupMonthPickerListener() {
        document.addEventListener('change', (e) => {
            if (e.target.id === 'sim-month') {
                this.updateSavingsGoalBox();
            }
        });
    },

    // ===============================
    // VALIDATION
    // ===============================
    validateFundInput(name, months, amount) {
        if (!name) {
            if (core.showWarningToast) {
                core.showWarningToast('Please enter a fund name');
            }
            document.getElementById('cf-name').focus();
            return false;
        }

        if (isNaN(months) || months <= 0) {
            if (core.showWarningToast) {
                core.showWarningToast('Please enter a valid number of months');
            }
            document.getElementById('cf-months').focus();
            return false;
        }

        if (isNaN(amount) || amount <= 0) {
            if (core.showWarningToast) {
                core.showWarningToast('Please enter a valid budget amount');
            }
            document.getElementById('cf-amount').focus();
            return false;
        }

        return true;
    },

    // ===============================
    // FUND CRUD OPERATIONS
    // ===============================
    async createNewFund(name, months, amount) {
        const newFund = {
            id: Date.now().toString(),
            name,
            months,
            amount,
            createdAt: new Date().toISOString()
        };
        
        customFunds.push(newFund);
        selectedFundId = newFund.id;
        
        await this.saveFunds();
        
        if (core.showSuccessToast) {
            core.showSuccessToast(`Created "${name}" fund`);
        }
    },

    async updateExistingFund(fundId, name, months, amount) {
        const fund = customFunds.find(f => f.id === fundId);
        if (fund) {
            fund.name = name;
            fund.months = months;
            fund.amount = amount;
        }
        
        editingFundId = null;
        document.getElementById('cf-submit-btn').textContent = 'Add';
        
        await this.saveFunds();
        
        if (core.showSuccessToast) {
            core.showSuccessToast(`Updated "${name}"`);
        }
    },

    handleEditFund(fundId) {
        const fund = customFunds.find(f => f.id === fundId);
        if (!fund) return;
        
        document.getElementById('cf-name').value = fund.name;
        document.getElementById('cf-months').value = fund.months;
        document.getElementById('cf-amount').value = fund.amount;
        editingFundId = fundId;
        document.getElementById('cf-submit-btn').textContent = 'Save';
        
        document.getElementById('cf-name').focus();
    },

    async cleanupOrphanedAllocations() {
        if (!core.getUser || !core.getUser()) return;
        
        const validFundIds = customFunds.map(f => f.id);
        const orphanedIds = Object.keys(simulatedData).filter(id => !validFundIds.includes(id));
        
        if (orphanedIds.length > 0) {
            console.log('🧹 Cleaning up orphaned allocations:', orphanedIds);
            
            orphanedIds.forEach(id => {
                delete simulatedData[id];
            });
            
            await this.saveFunds();
            
            if (core.showInfoToast) {
                core.showInfoToast(`Cleaned up ${orphanedIds.length} orphaned allocation(s)`);
            }
            
            this.updateSavingsGoalBox();
        }
    },

    async handleDeleteFund(fundId) {
        const fund = customFunds.find(f => f.id === fundId);
        const fundName = fund ? fund.name : 'this fund';
        
        const confirmed = core.showConfirm 
            ? await core.showConfirm(
                `Are you sure you want to delete "${fundName}"? All allocation data will be lost.`,
                'Delete Fund'
            )
            : confirm('Are you sure you want to delete this fund?');
        
        if (!confirmed) return;

        try {
            customFunds = customFunds.filter(f => f.id !== fundId);
            delete simulatedData[fundId];
            
            console.log('🗑️ Deleted fund and allocations:', fundId);
            
            if (selectedFundId === fundId) {
                selectedFundId = customFunds.length > 0 ? customFunds[0].id : null;
            }
            
            await this.saveFunds();
            
            this.renderFundsList();
            if (selectedFundId) {
                this.renderChartForFund(selectedFundId);
            } else if (window.budgetChart) {
                window.budgetChart.destroy();
                window.budgetChart = null;
            }
            
            this.updateSavingsGoalBox();
            
            if (core.showSuccessToast) {
                core.showSuccessToast(`Deleted "${fundName}"`);
            }
        } catch (error) {
            console.error('Error deleting fund:', error);
            if (core.showErrorToast) {
                core.showErrorToast('Failed to delete fund. Please try again.');
            }
        }
    },

    // ===============================
    // FIREBASE SYNC
    // ===============================
    async saveFunds() {
        if (core.getUser && core.getUser()) {
            const user = core.getUser();
            if (core.showSync) core.showSync();
            
            try {
                await Database.saveSinkingFunds(
                    user.uid, 
                    customFunds, 
                    simulatedData
                );
            } catch (error) {
                console.error("Failed to save funds to Firebase:", error);
                if (core.showErrorToast) {
                    core.showErrorToast('Failed to sync with cloud. Changes saved locally.');
                }
                throw error;
            } finally {
                if (core.hideSync) core.hideSync();
            }
        }
    },

    // ===============================
    // DATA ACCESSORS
    // ===============================
    setFunds(funds) {
        customFunds = funds || [];
        if (customFunds.length > 0 && !selectedFundId) {
            selectedFundId = customFunds[0].id;
        }
    },

    setSimulatedData(data) {
        simulatedData = data || {};
    },

    getFunds() {
        return customFunds;
    },

    getSimulatedData() {
        return simulatedData;
    },

    // ===============================
    // ALLOCATION MANAGEMENT
    // ===============================
    async handleSimSubmit() {
        if (!selectedFundId) {
            if (core.showWarningToast) {
                core.showWarningToast('Please select a fund first');
            }
            return;
        }
        
        if (!core.getUser || !core.getUser()) {
            if (core.showErrorToast) {
                core.showErrorToast('Please log in to save allocation data');
            }
            return;
        }
        
        const monthVal = document.getElementById('sim-month').value;
        const amountVal = parseFloat(document.getElementById('sim-amount').value);
        
        if (!monthVal) {
            if (core.showWarningToast) {
                core.showWarningToast('Please select a month');
            }
            document.getElementById('sim-month').focus();
            return;
        }
        
        if (isNaN(amountVal) || amountVal < 0) {
            if (core.showWarningToast) {
                core.showWarningToast('Please enter a valid allocation amount');
            }
            document.getElementById('sim-amount').focus();
            return;
        }

        try {
            if (!simulatedData[selectedFundId]) {
                simulatedData[selectedFundId] = {};
            }
            
            const isEdit = simulatedData[selectedFundId][monthVal] !== undefined;
            simulatedData[selectedFundId][monthVal] = amountVal;
            
            await this.saveFunds();
            
            this.resetSimUI();
            this.renderChartForFund(selectedFundId);
            this.updateSavingsGoalBox();
            
            if (core.showSuccessToast) {
                const [year, month] = monthVal.split('-');
                const date = new Date(year, parseInt(month) - 1);
                const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                const formattedAmount = core.formatCurrency ? core.formatCurrency(amountVal) : `$${amountVal}`;
                
                core.showSuccessToast(
                    isEdit 
                        ? `Updated ${monthName} allocation to ${formattedAmount}`
                        : `Added ${formattedAmount} for ${monthName}`
                );
            }
        } catch (error) {
            console.error('Error saving allocation:', error);
            if (core.showErrorToast) {
                core.showErrorToast('Failed to save allocation. Please try again.');
            }
        }
    },

    resetSimUI() {
        const amountInput = document.getElementById('sim-amount');
        const monthInput = document.getElementById('sim-month');
        
        if (amountInput) amountInput.value = '';
        if (monthInput) monthInput.disabled = false;
        
        document.getElementById('add-sim-btn')?.classList.remove('hidden');
        document.getElementById('edit-sim-btn')?.classList.add('hidden');
        document.getElementById('cancel-sim-btn')?.classList.add('hidden');
    },

    // ===============================
    // SAVINGS BUDGET CALCULATION
    // ===============================
    updateSavingsGoalBox() {
        const leftBox = document.getElementById('modal-savings-left');
        const monthLabel = document.getElementById('modal-savings-month-label');
        const monthInput = document.getElementById('sim-month');
        
        if (!leftBox || !core.getIncome) return;
        
        try {
            const income = core.getIncome();
            
            // Get selected month
            let selectedMonthStr = monthInput ? monthInput.value : null;
            if (!selectedMonthStr) {
                const now = new Date();
                selectedMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            }
            
            console.log('💰 Calculating savings for month:', selectedMonthStr);
            console.log('💵 Income:', income);
            
            // Get budget percentages
            const { needsPercent, wantsPercent, savingsPercent } = this.getBudgetPercentages();
            const needsBudget = income * (needsPercent / 100);
            const wantsBudget = income * (wantsPercent / 100);
            const savingsBudget = income * (savingsPercent / 100);
            
            console.log('📊 Budget breakdown:', { needsBudget, wantsBudget, savingsBudget });
            
            // Calculate expenses by category type
            const { needsSpent, wantsSpent } = this.calculateMonthlySpending(selectedMonthStr);
            
            console.log('💸 Spending:', { needsSpent, wantsSpent });
            
            // Calculate fund allocations
            const totalAllocatedThisMonth = this.calculateFundAllocations(selectedMonthStr);
            
            console.log('🏦 Fund allocations:', totalAllocatedThisMonth);
            
            // Calculate available savings budget
            const totalNeedsWantsBudget = needsBudget + wantsBudget;
            const totalNeedsWantsSpent = needsSpent + wantsSpent;
            
            let availableSavingsBudget = 0;
            
            if (totalNeedsWantsSpent <= totalNeedsWantsBudget) {
                availableSavingsBudget = savingsBudget - totalAllocatedThisMonth;
                console.log(`✅ Under budget: ${savingsBudget} - ${totalAllocatedThisMonth} = ${availableSavingsBudget}`);
            } else {
                const overBudgetAmount = totalNeedsWantsSpent - totalNeedsWantsBudget;
                availableSavingsBudget = savingsBudget - overBudgetAmount - totalAllocatedThisMonth;
                console.log(`❌ Over budget by ${overBudgetAmount}: ${savingsBudget} - ${overBudgetAmount} - ${totalAllocatedThisMonth} = ${availableSavingsBudget}`);
            }
            
            // Display result
            this.displaySavingsResult(leftBox, availableSavingsBudget);
            
            // Show warnings if necessary
            this.showSavingsWarnings(availableSavingsBudget, totalNeedsWantsSpent, totalNeedsWantsBudget);
            
            // Update month label
            this.updateMonthLabel(monthLabel, selectedMonthStr);
            
        } catch (error) {
            console.error('Error calculating savings budget:', error);
            if (leftBox) {
                leftBox.textContent = 'Error';
                leftBox.className = 'text-xl text-red-400 font-mono font-medium';
            }
        }
    },

    getBudgetPercentages() {
        const needsInput = document.getElementById('input-needs');
        const wantsInput = document.getElementById('input-wants');
        const savingsInput = document.getElementById('input-savings');
        
        return {
            needsPercent: needsInput ? parseInt(needsInput.value) : 50,
            wantsPercent: wantsInput ? parseInt(wantsInput.value) : 30,
            savingsPercent: savingsInput ? parseInt(savingsInput.value) : 20
        };
    },

    // ✅ FIXED: Proper currency handling
    calculateMonthlySpending(selectedMonthStr) {
        const expenses = core.getExpenses ? core.getExpenses() : [];
        const [year, month] = selectedMonthStr.split('-');
        const currentCurrency = core.getCurrency ? core.getCurrency() : 'USD';
        
        let needsSpent = 0;
        let wantsSpent = 0;
        
        console.log('💰 Calculating spending for', selectedMonthStr, 'in', currentCurrency);
        console.log('📊 Total expenses to check:', expenses.length);
        
        for (const exp of expenses) {
            const expDate = new Date(exp.date);
            const expYear = expDate.getFullYear().toString();
            const expMonth = String(expDate.getMonth() + 1).padStart(2, '0');
            
            if (expYear === year && expMonth === month) {
                let amount = exp.amount;
                const expenseCurrency = exp.currency || currentCurrency;
                
                console.log('📝 Expense:', exp.name, 'Amount:', amount, 'Currency:', expenseCurrency);
                
                // ✅ CRITICAL FIX: Only convert if currencies are DIFFERENT
                if (expenseCurrency !== currentCurrency) {
                    // Use core.convertCurrency if available
                    if (core.convertCurrency) {
                        const convertedAmount = core.convertCurrency(amount, expenseCurrency, currentCurrency);
                        console.log('  💱 Converted from', amount, expenseCurrency, 'to', convertedAmount, currentCurrency);
                        amount = convertedAmount;
                    } else if (typeof window !== 'undefined' && window.convertCurrency) {
                        const convertedAmount = window.convertCurrency(amount, expenseCurrency, currentCurrency);
                        console.log('  💱 Converted from', amount, expenseCurrency, 'to', convertedAmount, currentCurrency);
                        amount = convertedAmount;
                    } else {
                        console.warn('  ⚠️ No currency converter available, using raw amount');
                    }
                } else {
                    console.log('  ✅ Same currency, no conversion needed');
                }
                
                // Categorize by budget type
                const budgetType = getCategoryBudgetType(exp.category);
                
                if (budgetType === 'needs') {
                    needsSpent += amount;
                } else if (budgetType === 'wants') {
                    wantsSpent += amount;
                }
                
                console.log('  ✅ Added to', budgetType, '- Running totals: Needs:', needsSpent, 'Wants:', wantsSpent);
            }
        }
        
        console.log('💸 Final spending:', { needsSpent, wantsSpent });
        
        return { needsSpent, wantsSpent };
    },

    calculateFundAllocations(selectedMonthStr) {
        let totalAllocated = 0;
        
        console.log('📊 Calculating fund allocations for', selectedMonthStr);
        console.log('All simulatedData:', simulatedData);
        console.log('Valid fund IDs:', customFunds.map(f => f.id));
        
        for (const fundId in simulatedData) {
            console.log(`  Checking fund ${fundId}:`, simulatedData[fundId]);
            
            if (simulatedData[fundId][selectedMonthStr]) {
                const amount = simulatedData[fundId][selectedMonthStr];
                console.log(`    ✅ Found allocation: ${amount}`);
                totalAllocated += amount;
            }
        }
        
        console.log('💰 Total Allocated:', totalAllocated);
        
        return totalAllocated;
    },

    displaySavingsResult(leftBox, availableSavingsBudget) {
        leftBox.textContent = core.formatCurrency 
            ? core.formatCurrency(availableSavingsBudget) 
            : availableSavingsBudget.toLocaleString();
        
        if (availableSavingsBudget < 0) {
            leftBox.className = 'text-xl text-red-400 font-mono font-medium';
        } else if (availableSavingsBudget === 0) {
            leftBox.className = 'text-xl text-zinc-400 font-mono font-medium';
        } else {
            leftBox.className = 'text-xl text-emerald-400 font-mono font-medium';
        }
    },

    showSavingsWarnings(availableSavingsBudget, totalNeedsWantsSpent, totalNeedsWantsBudget) {
        if (availableSavingsBudget < 0 && core.showWarningToast) {
            const overage = Math.abs(availableSavingsBudget);
            
            clearTimeout(warningToastTimeout);
            
            warningToastTimeout = setTimeout(() => {
                if (totalNeedsWantsSpent > totalNeedsWantsBudget) {
                    const overBudgetAmount = totalNeedsWantsSpent - totalNeedsWantsBudget;
                    core.showWarningToast(
                        `You're over budget by ${core.formatCurrency(overBudgetAmount)} on Needs/Wants. Available savings: ${core.formatCurrency(availableSavingsBudget)}`
                    );
                } else {
                    core.showWarningToast(
                        `You've over-allocated savings by ${core.formatCurrency(overage)}. Reduce fund allocations or increase income.`
                    );
                }
            }, 1000);
        }
    },

    updateMonthLabel(monthLabel, selectedMonthStr) {
        if (!monthLabel || !selectedMonthStr) return;
        
        const [year, month] = selectedMonthStr.split('-');
        const date = new Date(year, parseInt(month) - 1, 1);
        const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        monthLabel.textContent = `for ${monthName}`;
    },

    // ===============================
    // RENDERING
    // ===============================
    renderFundsList() {
        const list = document.getElementById('custom-funds-list');
        if (!list) return;

        if (customFunds.length === 0) {
            list.innerHTML = '<div class="text-xs text-zinc-500 italic text-center py-4">No funds added yet.</div>';
            return;
        }

        list.innerHTML = customFunds.map(fund => {
            const isSelected = fund.id === selectedFundId;
            const borderClass = isSelected 
                ? 'border-emerald-500/50 bg-white/5' 
                : 'border-zinc-800/50 hover:bg-white/5';
            const formattedAmount = core.formatCurrency 
                ? core.formatCurrency(fund.amount) 
                : fund.amount.toLocaleString();

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
                    <button type="button" class="edit-cf-btn w-8 h-8 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 flex items-center justify-center transition-colors" data-id="${fund.id}" title="Edit">
                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                    </button>
                    <button type="button" class="delete-cf-btn w-8 h-8 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors" data-id="${fund.id}" title="Delete">
                        <iconify-icon icon="solar:trash-bin-minimalistic-linear"></iconify-icon>
                    </button>
                </div>
            </div>
            `;
        }).join('');
    },

    renderChartForFund(fundId) {
        const canvas = document.getElementById('budget-chart');
        if (!canvas) return;

        const fund = customFunds.find(f => f.id === fundId);
        if (!fund) return;

        if (window.budgetChart) {
            window.budgetChart.destroy();
        }

        const { startDate, endDate, startMonthStr, endMonthStr } = this.getFundDateRange(fund);
        this.configureDatePicker(startMonthStr, endMonthStr);

        const { labels, expectedData, actualData, monthKeys, totalSaved } = this.prepareChartData(fund, startDate);

        this.updateProgressCircle(totalSaved, fund.amount);

        this.renderChart(canvas, labels, expectedData, actualData, monthKeys);
    },

    getFundDateRange(fund) {
        const startDate = fund.createdAt ? new Date(fund.createdAt) : new Date();
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + fund.months - 1, 1);
        
        const startMonthStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
        const endMonthStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
        
        return { startDate, endDate, startMonthStr, endMonthStr };
    },

    configureDatePicker(startMonthStr, endMonthStr) {
        const simMonthInput = document.getElementById('sim-month');
        if (simMonthInput && !simMonthInput.disabled) {
            simMonthInput.min = startMonthStr;
            simMonthInput.max = endMonthStr;
            if (!simMonthInput.value || simMonthInput.value < startMonthStr || simMonthInput.value > endMonthStr) {
                simMonthInput.value = startMonthStr;
                this.updateSavingsGoalBox();
            }
        }
    },

    prepareChartData(fund, startDate) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const labels = [];
        const expectedData = [];
        const actualData = [];
        const monthKeys = [];
        const monthlyDue = fund.amount / fund.months;
        
        const simData = simulatedData[fund.id];
        const hasSimData = simData && Object.keys(simData).length > 0;
        
        let totalSaved = 0;

        for (let i = 0; i < fund.months; i++) {
            const stepDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
            const stepMonthStr = `${stepDate.getFullYear()}-${String(stepDate.getMonth() + 1).padStart(2, '0')}`;
            
            labels.push(monthNames[stepDate.getMonth()]);
            monthKeys.push(stepMonthStr);
            expectedData.push(monthlyDue);

            if (hasSimData && simData[stepMonthStr] !== undefined) {
                const val = simData[stepMonthStr];
                actualData.push(val);
                totalSaved += val;
            } else {
                actualData.push(0);
            }
        }

        return { labels, expectedData, actualData, monthKeys, totalSaved };
    },

    updateProgressCircle(totalSaved, goalAmount) {
        const progressPercent = goalAmount > 0 ? Math.min((totalSaved / goalAmount) * 100, 100) : 0;
        
        const circle = document.getElementById('fund-progress-circle');
        if (circle) {
            const circumference = 2 * Math.PI * 100;
            const offset = circumference - (progressPercent / 100) * circumference;
            circle.style.strokeDashoffset = offset;
        }
        
        const percentEl = document.getElementById('fund-progress-percent');
        if (percentEl) percentEl.textContent = Math.round(progressPercent) + '%';
        
        const savedEl = document.getElementById('fund-saved-amount');
        const goalEl = document.getElementById('fund-goal-amount');
        if (savedEl) savedEl.textContent = core.formatCurrency ? core.formatCurrency(totalSaved) : totalSaved.toLocaleString();
        if (goalEl) goalEl.textContent = core.formatCurrency ? core.formatCurrency(goalAmount) : goalAmount.toLocaleString();
    },

    renderChart(canvas, labels, expectedData, actualData, monthKeys) {
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
                            const { ctx, chartArea } = chart;
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
                        if (datasetIndex === 0) {
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
                        labels: {
                            color: '#a1a1aa',
                            font: { family: 'Inter, sans-serif', size: 12 },
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(24, 24, 27, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#a1a1aa',
                        borderColor: 'rgba(63, 63, 70, 0.5)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: function (context) {
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
                        suggestedMax: expectedData[0] * 1.5,
                        title: { display: true, text: 'Monthly Allocation Amount', color: '#71717a' },
                        grid: { color: 'rgba(63, 63, 70, 0.15)', drawBorder: false },
                        ticks: {
                            color: '#a1a1aa',
                            callback: function (value) {
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

// ===================================
// GLOBAL EXPORT
// ===================================
if (typeof window !== 'undefined') {
    window.BudgetPlanner = BudgetPlanner;
}
