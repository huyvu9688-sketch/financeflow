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
        console.log('💾 Saving budget to Firebase:', {
            userId,
            monthKey,
            budget,
            currency
        });
        
        try {
            // ✅ Save the entire monthlyBudgets object, not just one month
            const userRef = doc(db, 'users', userId);
            
            // Get current data first
            const userDoc = await getDoc(userRef);
            const currentData = userDoc.exists() ? userDoc.data() : {};
            
            // Update monthlyBudgets
            const monthlyBudgets = currentData.monthlyBudgets || {};
            monthlyBudgets[monthKey] = budget;
            
            // Save back
            await setDoc(userRef, {
                monthlyBudgets: monthlyBudgets,
                currency: currency,
                updatedAt: new Date()
            }, { merge: true });
            
            console.log('✅ Budget saved successfully to Firebase');
            console.log('📊 Current monthlyBudgets in Firebase:', monthlyBudgets);
            
        } catch (error) {
            console.error('❌ Failed to save budget:', error);
            throw error;
        }
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
