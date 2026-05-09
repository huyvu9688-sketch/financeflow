import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export const Database = {
    async loadUserData(userId) {
        try {
            // Load Expenses
            const q = query(collection(db, 'expenses'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            const expenses = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
                date: d.data().date || new Date().toISOString().split('T')[0]
            }));

            // Load Budget, Currency, Sinking Funds, and Fund Allocations
            let budget = null;
            let currency = null;
            let sinkingFunds = [];
            let fundAllocations = {};
            
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                const data = userDoc.data();
                budget = data.budget;
                currency = data.currency;
                sinkingFunds = data.sinkingFunds || [];
                fundAllocations = data.fundAllocations || {};
            }

            return { 
                expenses, 
                budget, 
                currency, 
                sinkingFunds,
                fundAllocations
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

    // ✅ FIXED - Added userId parameter (not used but matches the call signature)
    async updateExpense(userId, expenseId, updates) {
        await updateDoc(doc(db, 'expenses', expenseId), { 
            ...updates, 
            updatedAt: new Date() 
        });
    },

    // ✅ FIXED - Added userId parameter (not used but matches the call signature)
    async deleteExpense(userId, expenseId) {
        await deleteDoc(doc(db, 'expenses', expenseId));
    },

    async saveBudget(userId, budget, currency, sinkingFunds = null, fundAllocations = null) {
        const dataToSave = {
            budget: budget,
            currency: currency,
            updatedAt: new Date()
        };
        
        if (sinkingFunds !== null) {
            dataToSave.sinkingFunds = sinkingFunds;
        }

        if (fundAllocations !== null) {
            dataToSave.fundAllocations = fundAllocations;
        }

        await setDoc(doc(db, 'users', userId), dataToSave, { merge: true });
    }
};
