/**
 * nav.js - Navigation & Custom UI Components
 */

// --- 1. Custom Confirm Modal Logic ---
const ConfirmModal = {
    init() {
        if (!document.getElementById('custom-confirm-modal')) {
            const modalHtml = `
            <div id="custom-confirm-modal" class="hidden fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm opacity-0 transition-opacity duration-300">
                <div class="glass bg-gray-900/90 border border-gray-700 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 transform scale-95 transition-transform duration-300" id="confirm-box">
                    <div class="text-center">
                        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-900/30 mb-4">
                            <i id="confirm-icon" class="fas fa-exclamation-triangle text-red-400 text-xl"></i>
                        </div>
                        <h3 class="text-lg leading-6 font-medium text-white mb-2" id="confirm-title">Confirm Action</h3>
                        <div class="mt-2">
                            <p class="text-sm text-gray-400" id="confirm-message">Are you sure you want to proceed?</p>
                        </div>
                    </div>
                    <div class="mt-6 flex justify-center gap-3">
                        <button id="btn-cancel-confirm" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition">
                            Cancel
                        </button>
                        <button id="btn-yes-confirm" class="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-lg text-sm font-medium shadow-lg transition transform active:scale-95">
                            Yes, Confirm
                        </button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
    },

    // UPDATE: Tambahkan parameter 'confirmText' (default: "Yes, Confirm")
    show(message, onConfirm, confirmText = "Yes, Confirm") {
        this.init();
        const modal = document.getElementById('custom-confirm-modal');
        const box = document.getElementById('confirm-box');
        const msgEl = document.getElementById('confirm-message');
        const btnYes = document.getElementById('btn-yes-confirm');
        const btnNo = document.getElementById('btn-cancel-confirm');

        // Set pesan dan teks tombol
        msgEl.textContent = message;
        btnYes.textContent = confirmText; // <-- INI YANG MENGUBAH TEKS TOMBOL

        // Show Modal (Animation)
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            box.classList.remove('scale-95');
            box.classList.add('scale-100');
        }, 10);

        const close = () => {
            modal.classList.add('opacity-0');
            box.classList.remove('scale-100');
            box.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);

            btnYes.replaceWith(btnYes.cloneNode(true));
            btnNo.replaceWith(btnNo.cloneNode(true));
        };

        btnYes.onclick = () => {
            onConfirm();
            close();
        };

        btnNo.onclick = close;
        modal.onclick = (e) => { if (e.target === modal) close(); };
    }
};

const InputModal = {
    init() {
        if (!document.getElementById('custom-input-modal')) {
            const modalHtml = `
            <div id="custom-input-modal" class="hidden fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm opacity-0 transition-opacity duration-300">
                <div class="glass bg-gray-900/90 border border-gray-700 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 transform scale-95 transition-transform duration-300" id="input-box">
                    <div class="text-center">
                        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-900/30 mb-4">
                            <i class="fas fa-pen text-green-400 text-xl"></i>
                        </div>
                        <h3 class="text-lg leading-6 font-medium text-white mb-2" id="input-title">Input Needed</h3>
                        
                        <div class="mt-4">
                            <input type="text" id="custom-input-field" 
                                class="w-full p-3 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition"
                                placeholder="Type here..." autocomplete="off">
                        </div>
                    </div>
                    <div class="mt-6 flex justify-center gap-3">
                        <button id="btn-cancel-input" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition">
                            Cancel
                        </button>
                        <button id="btn-submit-input" class="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-medium shadow-lg transition transform active:scale-95">
                            Submit
                        </button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
    },

    show(title, placeholder, onSubmit, submitText = "Create") {
        this.init();
        const modal = document.getElementById('custom-input-modal');
        const box = document.getElementById('input-box');
        const titleEl = document.getElementById('input-title');
        const inputEl = document.getElementById('custom-input-field');
        const btnSubmit = document.getElementById('btn-submit-input');
        const btnCancel = document.getElementById('btn-cancel-input');

        // Setup UI
        titleEl.textContent = title;
        inputEl.placeholder = placeholder;
        inputEl.value = ""; // Reset value
        btnSubmit.textContent = submitText;

        // Show Modal
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            box.classList.remove('scale-95');
            box.classList.add('scale-100');
            inputEl.focus(); // Auto focus ke input
        }, 10);

        const close = () => {
            modal.classList.add('opacity-0');
            box.classList.remove('scale-100');
            box.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);

            // Clone buttons to remove listeners
            btnSubmit.replaceWith(btnSubmit.cloneNode(true));
            btnCancel.replaceWith(btnCancel.cloneNode(true));
        };

        // Handle Submit
        const handleSubmit = () => {
            const val = inputEl.value.trim();
            if (val) {
                onSubmit(val);
                close();
            } else {
                // Shake effect jika kosong
                inputEl.classList.add('ring-2', 'ring-red-500');
                setTimeout(() => inputEl.classList.remove('ring-2', 'ring-red-500'), 500);
                inputEl.focus();
            }
        };

        btnSubmit.onclick = handleSubmit;
        btnCancel.onclick = close;

        // Submit dengan tombol Enter
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') close();
        };

        modal.onclick = (e) => { if (e.target === modal) close(); };
    }
};

// --- 2. Navigation Logic ---
(() => {
    // ... (Kode Quick Nav Mobile Anda yang lama tetap di sini, jika ada) ...
    // Pastikan kode toggle mobile nav tetap ada di sini
    const btn = document.getElementById('quickNavBtn');
    const overlay = document.getElementById('quickNavOverlay');
    if (btn && overlay) {
        const open = () => {
            overlay.classList.remove('hidden');
            btn.setAttribute('aria-expanded', 'true');
            document.body.classList.add('overflow-hidden');
        };
        const close = () => {
            overlay.classList.add('hidden');
            btn.setAttribute('aria-expanded', 'false');
            document.body.classList.remove('overflow-hidden');
        };
        btn.addEventListener('click', () => {
            const isOpen = btn.getAttribute('aria-expanded') === 'true';
            isOpen ? close() : open();
        });
        overlay.querySelectorAll('[data-close], .quick-link').forEach(el => el.addEventListener('click', close));
    }
})();

// --- 3. Highlight Active Link ---
document.addEventListener("DOMContentLoaded", () => {
    const current = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href');
        if (href === current) {
            a.classList.add('text-green-400');
            // Jika di desktop nav, tambah border bawah
            if (a.closest('.hidden.md\\:flex')) {
                a.classList.add('border-b-2', 'border-green-400');
            }
        }
    });

    // --- 4. LOGOUT LOGIC (UPDATED) ---
    const userSession = localStorage.getItem("irrigation_user");

    if (userSession) {
        const navContainer = document.querySelector(".flex.items-center.space-x-6"); // Target container navbar kanan

        if (navContainer) {
            // Hapus tombol logout lama jika ada (untuk menghindari duplikat saat reload script)
            const oldBtn = document.getElementById('logoutBtnNav');
            if (oldBtn) oldBtn.remove();

            const logoutBtn = document.createElement("button");
            logoutBtn.id = "logoutBtnNav";
            logoutBtn.className = "text-gray-400 hover:text-red-400 transition flex items-center space-x-1 ml-4 border-l border-gray-600 pl-4";
            logoutBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i><span class="hidden md:inline">Logout</span>`;

            // INTERAKSI BARU: Menggunakan Custom Modal, bukan confirm()
            logoutBtn.onclick = () => {
                ConfirmModal.show("Are you sure you want to log out from the system?", () => {
                    // Aksi jika user klik YES
                    localStorage.removeItem("irrigation_user");

                    // Cek jika Toast tersedia (dari langkah sebelumnya)
                    if (window.Toast) {
                        window.Toast.success("Logged out successfully.");
                        setTimeout(() => window.location.href = "login.html", 1000);
                    } else {
                        window.location.href = "login.html";
                    }
                }, "Yes, Logout");
            };

            navContainer.appendChild(logoutBtn);
        }
    }
});