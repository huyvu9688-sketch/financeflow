import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyBMkd3pdv_KwzDMMuRSPG6scVb52txbIwA",
    authDomain: "financeflow-4a92a.firebaseapp.com",
    projectId: "financeflow-4a92a",
    storageBucket: "financeflow-4a92a.firebasestorage.app",
    messagingSenderId: "847970406118",
    appId: "1:847970406118:web:adb9d01a4cb28e6a557527"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
