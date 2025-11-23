const API_BASE = "https://water-bender-service.onrender.com/api/auth";

// --- Load Users (Responsive Grid) ---
async function loadUsers() {
    // Kita target container baru, bukan tbody lagi
    const container = document.getElementById("userListContainer");

    try {
        const res = await fetch(`${API_BASE}/users`);
        if (!res.ok) throw new Error("Failed to fetch users");

        const users = await res.json();
        container.innerHTML = "";

        if (users.length === 0) {
            container.innerHTML = `<div class="text-center py-8 text-gray-500">No users found.</div>`;
            return;
        }

        users.forEach(user => {
            const isLinked = user.telegram_chat_id !== null;
            // Style badge telegram
            const telegramStatus = isLinked
                ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">LINKED</span>`
                : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700 text-gray-400">PENDING</span>`;

            const roleColor = user.role === 'admin' ? 'text-purple-400' : 'text-gray-300';
            const icon = user.role === 'admin' ? 'fa-user-shield' : 'fa-user';

            const safeUsername = user.username.replace(/'/g, "\\'");
            const safeRole = user.role;

            // Tombol Delete / Lock
            let deleteActionHTML;
            if (user.username === 'admin') {
                deleteActionHTML = `
                    <button class="text-gray-600 cursor-not-allowed p-2" title="Locked">
                        <i class="fas fa-lock text-sm"></i>
                    </button>
                `;
            } else {
                deleteActionHTML = `
                    <button onclick="deleteUser(${user.id}, '${safeUsername}')" 
                        class="text-gray-400 hover:text-red-400 transition p-2 rounded hover:bg-red-900/20"
                        title="Delete User">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                `;
            }

            // Buat elemen DIV (bukan TR)
            const item = document.createElement("div");
            // Class ini membuat tampilan:
            // Mobile: Kotak (Card) dengan background gelap
            // Desktop: Grid baris biasa yang transparan
            item.className = "relative grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center p-4 md:p-3 rounded-xl bg-gray-800/40 md:bg-transparent border border-gray-700 md:border-0 md:border-b md:border-gray-700/30 hover:bg-gray-800/60 transition duration-200";

            item.innerHTML = `
                <div class="col-span-1 md:col-span-4 flex items-center justify-between md:justify-start">
                    <span class="md:hidden text-[10px] text-gray-500 font-bold uppercase tracking-widest">User</span>
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-gray-700/50 flex items-center justify-center text-gray-400 text-xs shadow-sm">
                            <i class="fas ${icon}"></i>
                        </div>
                        <span class="font-medium text-sm text-gray-200">${user.username}</span>
                    </div>
                </div>

                <div class="col-span-1 md:col-span-3 flex items-center justify-between md:justify-start">
                    <span class="md:hidden text-[10px] text-gray-500 font-bold uppercase tracking-widest">Role</span>
                    <span class="${roleColor} capitalize text-xs font-bold tracking-wide px-2 py-1 rounded bg-gray-900/30 md:bg-transparent md:p-0">${user.role}</span>
                </div>

                <div class="col-span-1 md:col-span-3 flex items-center justify-between md:justify-center">
                    <span class="md:hidden text-[10px] text-gray-500 font-bold uppercase tracking-widest">Telegram</span>
                    ${telegramStatus}
                </div>

                <div class="col-span-1 md:col-span-2 flex items-center justify-end gap-1 mt-2 md:mt-0 pt-3 md:pt-0 border-t border-gray-700/50 md:border-0">
                    <button onclick="openEditModal(${user.id}, '${safeUsername}', '${safeRole}')" 
                        class="text-gray-400 hover:text-yellow-400 transition p-2 rounded hover:bg-yellow-900/20"
                        title="Edit User">
                        <i class="fas fa-pen text-sm"></i>
                    </button>
                    ${deleteActionHTML}
                </div>
            `;
            container.appendChild(item);
        });

    } catch (err) {
        console.error("Error loading users:", err);
        container.innerHTML = `<div class="text-center py-8 text-red-400 bg-red-900/10 rounded-lg">Error loading data.</div>`;
    }
}

// --- Add User ---
document.getElementById("addUserForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type='submit']");
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;

    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Creating...`;
    submitBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, role })
        });
        const data = await res.json();

        if (res.ok) {
            showToast(`✅ User "${username}" created!`);
            e.target.reset();
            loadUsers();
        } else {
            alert("Error: " + (data.error || "Failed"));
        }
    } catch (err) {
        console.error(err);
        alert("Server error.");
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    }
});

// --- Delete User ---
// --- Delete User (Updated with Custom Modal) ---
function deleteUser(id, username) {
    // Menggunakan ConfirmModal dari nav.js
    ConfirmModal.show(
        `Are you sure you want to delete user "${username}"?\nThis action cannot be undone.`,

        // Callback jika user klik YES
        async () => {
            try {
                const res = await fetch(`${API_BASE}/users/${id}`, {
                    method: "DELETE"
                });

                if (res.ok) {
                    // Gunakan Toast jika tersedia
                    if (window.Toast) window.Toast.success("🗑️ User deleted successfully.");
                    loadUsers(); // Refresh tabel otomatis
                } else {
                    const data = await res.json();
                    if (window.Toast) window.Toast.error(data.error || "Failed to delete user.");
                    else alert(data.error);
                }
            } catch (err) {
                console.error("Delete error:", err);
                if (window.Toast) window.Toast.error("Server connection error.");
            }
        },

        // Teks Tombol Merah
        "Yes, Delete User"
    );
}

// === EDIT MODAL LOGIC ===
const modal = document.getElementById("editUserModal");

function openEditModal(id, username, role) {
    document.getElementById("editUserId").value = id;
    document.getElementById("editUsername").value = username;
    document.getElementById("editRole").value = role;
    document.getElementById("editPassword").value = ""; // Reset password field

    modal.classList.remove("hidden");
}

function closeEditModal() {
    modal.classList.add("hidden");
}

// Close modal if clicking outside
modal.addEventListener("click", (e) => {
    if (e.target === modal) closeEditModal();
});

async function saveEditUser() {
    const id = document.getElementById("editUserId").value;
    const username = document.getElementById("editUsername").value;
    const password = document.getElementById("editPassword").value;
    const role = document.getElementById("editRole").value;

    if (!username) return alert("Username is required");

    try {
        const res = await fetch(`${API_BASE}/users/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, role })
        });
        const data = await res.json();

        if (res.ok) {
            showToast("✅ User updated successfully!");
            closeEditModal();
            loadUsers();
        } else {
            alert("Error: " + (data.error || "Update failed"));
        }
    } catch (err) {
        console.error(err);
        alert("Server error.");
    }
}

// --- Helper: Simple Toast ---
function showToast(message) {
    const t = document.createElement("div");
    t.className = "fixed bottom-5 right-5 bg-gray-800 text-white px-6 py-3 rounded-lg shadow-xl border border-gray-700 z-[200] animate-bounce-in";
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// --- Init ---
document.addEventListener("DOMContentLoaded", loadUsers);