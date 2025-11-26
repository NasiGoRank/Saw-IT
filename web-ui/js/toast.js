/**
 * Toast Notification System
 * Style: Glassmorphism & Tailwind
 */
const Toast = {
    container: null,

    // Inisialisasi Container (Hanya dibuat sekali)
    init() {
        if (!document.getElementById('toast-container')) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            // Posisi: Kanan Atas (Top-Right), z-index tinggi agar di atas navbar
            this.container.className = 'fixed top-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none';
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('toast-container');
        }
    },

    /**
     * Tampilkan Notifikasi
     * @param {string} message - Pesan yang ditampilkan
     * @param {string} type - 'success', 'error', 'warning', 'info'
     */
    show(message, type = 'info') {
        this.init();

        // Konfigurasi Warna & Ikon berdasarkan Tipe
        const config = {
            success: {
                icon: 'fa-check-circle',
                color: 'text-green-400',
                border: 'border-green-500/50',
                bg: 'bg-green-900/20' // Subtle tint
            },
            error: {
                icon: 'fa-times-circle',
                color: 'text-red-400',
                border: 'border-red-500/50',
                bg: 'bg-red-900/20'
            },
            warning: {
                icon: 'fa-exclamation-triangle',
                color: 'text-yellow-400',
                border: 'border-yellow-500/50',
                bg: 'bg-yellow-900/20'
            },
            info: {
                icon: 'fa-info-circle',
                color: 'text-blue-400',
                border: 'border-blue-500/50',
                bg: 'bg-blue-900/20'
            }
        };

        const theme = config[type] || config.info;

        // Membuat Elemen Toast
        const toast = document.createElement('div');
        toast.className = `
            pointer-events-auto flex items-center w-80 md:w-96 p-4 rounded-xl shadow-2xl 
            backdrop-blur-xl bg-gray-900/80 border ${theme.border} ${theme.bg}
            toast-enter relative overflow-hidden group select-none
        `;

        // HTML Content
        toast.innerHTML = `
            <div class="flex-shrink-0 mr-4">
                <i class="fas ${theme.icon} ${theme.color} text-2xl drop-shadow-md"></i>
            </div>
            
            <div class="flex-1">
                <p class="text-sm font-medium text-gray-100 leading-snug">${message}</p>
            </div>

            <button class="absolute top-2 right-2 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" onclick="this.parentElement.remove()">
                <i class="fas fa-times text-xs"></i>
            </button>

            <div class="absolute bottom-0 left-0 h-1 ${theme.bg.replace('/20', '')} w-full origin-left animate-shrink"></div>
        `;

        // Style untuk animasi progress bar (inline agar dinamis)
        const progressBar = toast.querySelector('.animate-shrink');
        progressBar.style.transition = 'width 3.5s linear';

        // Tambahkan ke container
        this.container.appendChild(toast);

        // Mulai animasi progress bar setelah render
        requestAnimationFrame(() => {
            progressBar.style.width = '0%';
        });

        // Hapus otomatis setelah 3.5 detik
        setTimeout(() => {
            toast.classList.remove('toast-enter');
            toast.classList.add('toast-exit');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3500);
    },

    // Shortcut Methods
    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); }
};

// Expose global
window.Toast = Toast;