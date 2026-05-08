import { auth } from './firebase-config.js';
import { 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    updateProfile 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// --- Account Local Storage Management ---
function getStoredAccounts() {
    const accounts = localStorage.getItem('financeflow_accounts');
    return accounts ? JSON.parse(accounts) : [];
}

function saveAccount(user) {
    const accounts = getStoredAccounts();
    const existingIndex = accounts.findIndex(acc => acc.uid === user.uid);
    
    const accountData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email)}&background=10b981&color=fff`,
        lastLogin: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
        accounts[existingIndex] = accountData;
    } else {
        accounts.push(accountData);
    }
    
    localStorage.setItem('financeflow_accounts', JSON.stringify(accounts));
}

export function updateAccountUI(user) {
    if (!user) return;
    
    const displayName = user.displayName || user.email.split('@')[0];
    const photoURL = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email)}&background=10b981&color=fff`;
    
    // Update Header Avatar
    const headerAvatar = document.getElementById('current-user-avatar');
    const headerName = document.getElementById('current-user-name');
    if(headerAvatar) headerAvatar.src = photoURL;
    if(headerName) headerName.textContent = displayName;
    
    // Update Menu Avatar
    const menuAvatar = document.getElementById('menu-user-avatar');
    const menuName = document.getElementById('menu-user-name');
    const menuEmail = document.getElementById('menu-user-email');
    if(menuAvatar) menuAvatar.src = photoURL;
    if(menuName) menuName.textContent = displayName;
    if(menuEmail) menuEmail.textContent = user.email;
    
    // Update Settings Avatar
    const settingsAvatar = document.getElementById('settings-user-avatar');
    const settingsName = document.getElementById('settings-user-name');
    if(settingsAvatar) settingsAvatar.src = photoURL;
    if(settingsName) settingsName.textContent = displayName;
}

// --- Exported Auth Setup ---
export function setupAuth(callbacks) {
    const { onLogin, onLogout } = callbacks;

    // ==================== MODAL SWITCHING ====================
    const loginModal = document.getElementById('login-modal');
    const signupModal = document.getElementById('signup-modal');
    
    // Open Login Modal from Nav
    const showLoginBtnNav = document.getElementById('show-login-btn-nav');
    if (showLoginBtnNav) {
        showLoginBtnNav.addEventListener('click', () => loginModal.classList.add('active'));
    }

    // Switch to Signup
    const showSignupBtn = document.getElementById('show-signup-btn');
    if (showSignupBtn) {
        showSignupBtn.addEventListener('click', () => {
            loginModal.classList.remove('active');
            signupModal.classList.add('active');
        });
    }

    // Switch to Login
    const switchToLoginBtn = document.getElementById('switch-to-login-btn');
    if (switchToLoginBtn) {
        switchToLoginBtn.addEventListener('click', () => {
            signupModal.classList.remove('active');
            loginModal.classList.add('active');
        });
    }

    // Close Modals
    const closeLoginModal = document.getElementById('close-login-modal');
    const closeSignupModal = document.getElementById('close-signup-modal');
    if (closeLoginModal) closeLoginModal.addEventListener('click', () => loginModal.classList.remove('active'));
    if (closeSignupModal) closeSignupModal.addEventListener('click', () => signupModal.classList.remove('active'));


    // ==================== 1. Google Auth ====================
    const googleLoginBtn = document.getElementById('google-login-btn');
    const googleSignupBtn = document.getElementById('google-signup-btn');
    
    const handleGoogleAuth = async () => {
        try {
            const provider = new GoogleAuthProvider();
            
            // Force Google to show the account selection screen every time
            provider.setCustomParameters({
                prompt: 'select_account'
            });
            
            await signInWithPopup(auth, provider);
            
            loginModal.classList.remove('active');
            signupModal.classList.remove('active');
        } catch (error) {
            // Ignore the error if the user just closed the popup intentionally
            if (error.code !== 'auth/popup-closed-by-user') {
                alert('Google Auth failed: ' + error.message);
            }
        }
    };

    if (googleLoginBtn) googleLoginBtn.addEventListener('click', handleGoogleAuth);
    if (googleSignupBtn) googleSignupBtn.addEventListener('click', handleGoogleAuth);

    // ==================== 2. Email/Password Login ====================
    const loginForm = document.getElementById('email-login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            try {
                await signInWithEmailAndPassword(auth, email, password);
                loginModal.classList.remove('active');
            } catch (error) {
                alert('Login failed: Invalid email or password.');
            }
        });
    }

    // ==================== 3. Email/Password Signup ====================
    const signupForm = document.getElementById('email-signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signup-name').value;
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            try {
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(cred.user, { displayName: name });
                signupModal.classList.remove('active');
            } catch (error) {
                alert('Signup failed: ' + error.message);
            }
        });
    }

    // ==================== 4. Logout ====================
    const logoutBtn = document.getElementById('logout-btn');
    const settingsLogoutBtn = document.getElementById('settings-logout-btn');
    
    const handleLogout = async () => {
        if (confirm('Are you sure you want to logout?')) {
            await signOut(auth);
            loginModal.classList.remove('active');
            setTimeout(() => location.reload(), 100);
        }
    };

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (settingsLogoutBtn) settingsLogoutBtn.addEventListener('click', handleLogout);

    // ==================== 5. Auth State Observer ====================
    onAuthStateChanged(auth, (user) => {
        const loginBtnNav = document.getElementById('show-login-btn-nav');
        const accountSwitcher = document.getElementById('account-switcher-wrapper');

        if (user) {
            saveAccount(user);
            updateAccountUI(user);
            if (loginBtnNav) loginBtnNav.style.display = 'none';
            if (accountSwitcher) accountSwitcher.style.display = 'block';
            if (onLogin) onLogin(user);
        } else {
            if (loginBtnNav) loginBtnNav.style.display = 'block';
            if (accountSwitcher) accountSwitcher.style.display = 'none';
            if (onLogout) onLogout();
        }
    });
}