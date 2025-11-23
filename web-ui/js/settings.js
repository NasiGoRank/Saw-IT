const API_BASE = "http://localhost:5000/api/auth";

// --- Load Users ---
async function loadUsers() {
    const tbody = document.getElementById("userTableBody");
    try {
        const res = await fetch(`${API_BASE}/users`);
        if (!res.ok) throw new Error("Failed to fetch users");

        const users = await res.json();
        tbody.innerHTML = "";

        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">No users found.</td></tr>`;
            return;
        }

        users.forEach(user => {
            const isLinked = user.telegram_chat_id !== null;
            const telegramStatus = isLinked
                ? `<span class="px-2 py-1 rounded-full bg-blue-900/40 text-blue-400 text-xs border border-blue-800">Linked</span>`
                : `<span class="px-2 py-1 rounded-full bg-gray-700 text-gray-400 text-xs">Pending</span>`;

            const roleColor = user.role === 'admin' ? 'text-purple-400' : 'text-gray-300';
            const icon = user.role === 'admin' ? 'fa-user-shield' : 'fa-user';

            // Escape strings
            const safeUsername = user.username.replace(/'/g, "\\'");
            const safeRole = user.role;

            // LOGIKA BARU: Tentukan tombol Delete atau Gembok
            let deleteActionHTML;
            if (user.username === 'admin') {
                // Jika Admin, tampilkan gembok (tidak bisa delete)
                deleteActionHTML = `
                    <button class="text-gray-600 cursor-not-allowed p-2 rounded-full" title="Main Admin cannot be deleted">
                        <i class="fas fa-lock"></i>
                    </button>
                `;
            } else {
                // Jika user biasa, tampilkan tombol hapus
                deleteActionHTML = `
                    <button onclick="deleteUser(${user.id}, '${safeUsername}')" 
                        class="text-gray-500 hover:text-red-400 transition p-2 rounded-full hover:bg-red-900/20"
                        title="Delete User">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
            }

            const tr = document.createElement("tr");
            tr.className = "border-b border-gray-700/50 hover:bg-gray-800/30 transition group";
            tr.innerHTML = `
                <td class="py-4 px-2 font-medium flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-gray-400">
                        <i class="fas ${icon}"></i>
                    </div>
                    ${user.username}
                </td>
                <td class="py-4 px-2 ${roleColor} font-medium capitalize">${user.role}</td>
                <td class="py-4 px-2 text-center">${telegramStatus}</td>
                <td class="py-4 px-2 text-right">
                    <button onclick="openEditModal(${user.id}, '${safeUsername}', '${safeRole}')" 
                        class="text-gray-500 hover:text-yellow-400 transition p-2 rounded-full hover:bg-yellow-900/20 mr-1"
                        title="Edit User">
                        <i class="fas fa-edit"></i>
                    </button>
                    
                    ${deleteActionHTML}
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Error loading users:", err);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-400">Error loading data.</td></tr>`;
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