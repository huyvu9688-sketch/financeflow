// ✅ TOAST NOTIFICATION SYSTEM

let toastContainer = null;

function ensureToastContainer() {
    if (!toastContainer) {
        toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none';
            document.body.appendChild(toastContainer);
        }
    }
    return toastContainer;
}

export function showToast(message, type = 'info', duration = 3000) {
    const container = ensureToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type} pointer-events-auto`;
    
    const icons = {
        success: '<iconify-icon icon="solar:check-circle-bold" class="text-emerald-400 text-xl flex-shrink-0"></iconify-icon>',
        error: '<iconify-icon icon="solar:close-circle-bold" class="text-red-400 text-xl flex-shrink-0"></iconify-icon>',
        warning: '<iconify-icon icon="solar:info-circle-bold" class="text-amber-400 text-xl flex-shrink-0"></iconify-icon>',
        info: '<iconify-icon icon="solar:info-circle-bold" class="text-blue-400 text-xl flex-shrink-0"></iconify-icon>'
    };
    
    toast.innerHTML = `
        ${icons[type] || icons.info}
        <span class="flex-1">${message}</span>
        <button class="toast-close ml-2 opacity-50 hover:opacity-100 transition-opacity" aria-label="Close">
            <iconify-icon icon="solar:close-linear" class="text-sm"></iconify-icon>
        </button>
    `;
    
    container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    // Close button
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        removeToast(toast);
    });
    
    // Auto-remove
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toast);
        }, duration);
    }
    
    return toast;
}

function removeToast(toast) {
    toast.classList.add('removing');
    setTimeout(() => {
        toast.remove();
    }, 300);
}

export function showSuccessToast(message, duration = 3000) {
    return showToast(message, 'success', duration);
}

export function showErrorToast(message, duration = 5000) {
    return showToast(message, 'error', duration);
}

export function showWarningToast(message, duration = 4000) {
    return showToast(message, 'warning', duration);
}

export function showInfoToast(message, duration = 3000) {
    return showToast(message, 'info', duration);
}

// ✅ LOADING INDICATOR
export function showLoading(message = 'Loading...') {
    const existing = document.getElementById('global-loading');
    if (existing) return existing;
    
    const loading = document.createElement('div');
    loading.id = 'global-loading';
    loading.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center';
    loading.innerHTML = `
        <div class="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <div class="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
            <p class="text-white font-medium">${message}</p>
        </div>
    `;
    
    document.body.appendChild(loading);
    return loading;
}

export function hideLoading() {
    const loading = document.getElementById('global-loading');
    if (loading) {
        loading.remove();
    }
}

// ✅ CONFIRMATION DIALOG
export function showConfirm(message, title = 'Confirm Action') {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-fade-in">
                <h3 class="text-xl font-semibold text-white mb-3">${title}</h3>
                <p class="text-zinc-300 mb-6 leading-relaxed">${message}</p>
                <div class="flex gap-3 justify-end">
                    <button class="confirm-cancel px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium">
                        Cancel
                    </button>
                    <button class="confirm-ok px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-medium">
                        Confirm
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const okBtn = modal.querySelector('.confirm-ok');
        const cancelBtn = modal.querySelector('.confirm-cancel');
        
        okBtn.addEventListener('click', () => {
            modal.remove();
            resolve(true);
        });
        
        cancelBtn.addEventListener('click', () => {
            modal.remove();
            resolve(false);
        });
        
        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        });
    });
}
