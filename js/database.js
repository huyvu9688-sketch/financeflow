import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export const Database = {
    async loadUserData(userId) {
        try {
            // ✅ Load user's default currency FIRST
            const userDoc = await getDoc(doc(db, 'users', userId));
            const userDefaultCurrency = userDoc.exists() ? (userDoc.data().currency || 'USD') : 'USD';
            
            // Load Expenses
            const q = query(collection(db, 'expenses'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            const expenses = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
                date: d.data().date || new Date().toISOString().split('T')[0],
                currency: d.data().currency || userDefaultCurrency // ✅ Default to user's currency
            }));

            // Load Budget, Currency, Sinking Funds, and Fund Allocations
            let currency = null;
            let sinkingFunds = [];
            let fundAllocations = {};
            let monthlyBudgets = {};
            
            if (userDoc.exists()) {
                const data = userDoc.data();
                currency = data.currency;
                sinkingFunds = data.sinkingFunds || [];
                fundAllocations = data.fundAllocations || {};
                monthlyBudgets = data.monthlyBudgets || {};
            }

            return { 
                expenses, 
                currency, 
                sinkingFunds,
                fundAllocations,
                monthlyBudgets
            };
        } catch (error) {
            console.error('Load error:', error);
            throw error;
        }
    },

    async saveExpense(userId, expense, currency) {
        const docRef = await addDoc(collection(db, 'expenses'), {
            userId: userId,
            ...expense,
            currency: currency,
            createdAt: new Date()
        });
        return docRef.id;
    },

    async updateExpense(userId, expenseId, updates) {
        await updateDoc(doc(db, 'expenses', expenseId), { 
            ...updates, 
            updatedAt: new Date() 
        });
    },

    async deleteExpense(userId, expenseId) {
        await deleteDoc(doc(db, 'expenses', expenseId));
    },

    async saveMonthlyBudget(userId, monthKey, budget, currency) {
        const dataToSave = {
            [`monthlyBudgets.${monthKey}`]: budget,
            currency: currency,
            updatedAt: new Date()
        };
        
        await setDoc(doc(db, 'users', userId), dataToSave, { merge: true });
    },

    async saveSinkingFunds(userId, sinkingFunds, fundAllocations) {
        const dataToSave = {
            sinkingFunds: sinkingFunds,
            fundAllocations: fundAllocations,
            updatedAt: new Date()
        };
        
        await setDoc(doc(db, 'users', userId), dataToSave, { merge: true });
    }
};
