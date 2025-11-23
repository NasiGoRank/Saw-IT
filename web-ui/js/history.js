const API_BASE = "http://localhost:5000/api/history";

// --- Toast Helper (Optional Fallback) ---
function showNotification(msg, type = 'success') {
    if (window.Toast) {
        if (type === 'error') window.Toast.error(msg);
        else window.Toast.success(msg);
    } else {
        const color = type === 'error' ? 'bg-red-700' : 'bg-gray-800';
        const t = document.createElement("div");
        t.className = `fixed bottom-5 right-5 ${color} text-white px-4 py-2 rounded-lg shadow-lg z-50`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2200);
    }
}

async function loadHistory() {
    try {
        // Mengambil data dari backend
        const res = await axios.get(API_BASE);
        const logs = res.data;
        const tbody = document.getElementById("logTableBody");
        tbody.innerHTML = "";

        if (!logs.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-gray-400">No history yet</td></tr>`;
            return;
        }

        logs.forEach((log) => {
            // --- PERBAIKAN TANGGAL DI SINI ---
            // Kita langsung masukkan log.timestamp ke new Date() tanpa menambah "Z"
            const dateObj = new Date(log.timestamp);
            const dateString = isNaN(dateObj) ? "Invalid Date" : dateObj.toLocaleString();

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="px-6 py-3 text-center">${dateString}</td>
                <td class="px-6 py-3 text-center ${log.status === "ON" ? "text-green-400" : "text-red-400"}">${log.status}</td>
                <td class="px-6 py-3 text-center">${log.mode}</td>
                <td class="px-6 py-3 text-center">${log.soil !== null ? `${log.soil}%` : 'N/A'}</td>
                <td class="px-6 py-3 text-center">${log.rain !== null ? `${log.rain}%` : 'N/A'}</td>
                <td class="px-6 py-3 text-center">
                    <button class="text-red-400 hover:text-red-600 transition p-2 rounded-full hover:bg-red-900/20" onclick="deleteLog(${log.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>`;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Error loading history:", err);
        showNotification("Failed to load history", "error");
    }
}

// --- DELETE ONE LOG (Updated with ConfirmModal) ---
function deleteLog(id) {
    if (typeof ConfirmModal !== 'undefined') {
        ConfirmModal.show("Are you sure you want to delete this log entry?", async () => {
            try {
                await axios.delete(`${API_BASE}/${id}`);
                showNotification("Log deleted successfully", "success");
                loadHistory();
            } catch (err) {
                console.error(err);
                showNotification("Failed to delete log", "error");
            }
        }, "Yes, Delete");
    } else {
        // Fallback jika ConfirmModal belum siap
        if (confirm("Delete this log?")) {
            axios.delete(`${API_BASE}/${id}`).then(() => loadHistory());
        }
    }
}

// --- DELETE ALL LOGS (Updated with ConfirmModal) ---
function clearAll() {
    if (typeof ConfirmModal !== 'undefined') {
        ConfirmModal.show("⚠️ Delete ALL history logs? This action cannot be undone.", async () => {
            try {
                await axios.delete(API_BASE);
                showNotification("All logs cleared", "success");
                loadHistory();
            } catch (err) {
                console.error(err);
                showNotification("Failed to clear logs", "error");
            }
        }, "Yes, Clear All");
    } else {
        if (confirm("Delete all logs?")) {
            axios.delete(API_BASE).then(() => loadHistory());
        }
    }
}

function exportCSV() {
    // Pastikan URL API benar saat export
    window.open(`${API_BASE}/export/csv`, "_blank");
}

document.addEventListener("DOMContentLoaded", () => {
    loadHistory();
    const btnExport = document.getElementById("btnExport");
    const btnClear = document.getElementById("btnClear");
    if (btnExport) btnExport.addEventListener("click", exportCSV);
    if (btnClear) btnClear.addEventListener("click", clearAll);
});