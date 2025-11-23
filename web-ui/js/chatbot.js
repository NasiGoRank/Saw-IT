const chatbox = document.getElementById("chatbox");
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

let sessionListContainer = document.getElementById("chatSessions");
let currentSessionId = null;

// ... (Fungsi appendMessage tetap sama, tidak perlu diubah) ...
function appendMessage(sender, text) {
    const bubble = document.createElement("div");
    bubble.className = sender === "user" ? "text-right mb-3 message-user" : "text-left mb-3 message-assistant";
    bubble.innerHTML = `
    <div class="inline-block px-4 py-2 rounded-xl ${sender === "user" ? "bg-green-500 text-black" : "bg-gray-700 text-gray-200"} max-w-[80%]">
      ${text}
    </div>`;
    chatbox.appendChild(bubble);
    chatbox.scrollTop = chatbox.scrollHeight;
}

/* ------------------------------
   Sidebar Rendering (UPDATED)
--------------------------------*/
async function loadSessions() {
    try {
        const res = await fetch("http://localhost:5000/chat/sessions");
        const sessions = await res.json();

        if (!sessionListContainer) return;
        sessionListContainer.innerHTML = "";

        sessions.forEach((s) => {
            const item = document.createElement("div");
            const isActive = s.id === currentSessionId;

            item.className = `flex justify-between items-center px-3 py-2 rounded transition ${isActive ? "bg-green-700/40 border border-green-500 shadow-md" : "hover:bg-gray-800"}`;

            const btn = document.createElement("button");
            btn.textContent = s.name;
            btn.className = `flex-1 text-left truncate ${isActive ? "text-green-400 font-semibold" : "hover:text-green-400"} transition`;
            btn.onclick = () => loadChat(s.id, s.name);

            const del = document.createElement("button");
            del.innerHTML = `<i class="fas fa-trash ${isActive ? "text-red-400 hover:text-red-500" : "text-red-500/70 hover:text-red-400"}"></i>`;

            // --- CUSTOM MODAL DI SINI ---
            del.onclick = (e) => {
                e.stopPropagation();
                ConfirmModal.show(`Delete chat session "${s.name}"?`, async () => {
                    try {
                        await fetch(`http://localhost:5000/chat/session/${s.id}`, { method: "DELETE" });

                        // Jika sesi yang dihapus sedang aktif, reset tampilan
                        if (s.id === currentSessionId) {
                            currentSessionId = null;
                            chatbox.innerHTML = "";
                        }

                        await loadSessions();
                        if (window.Toast) window.Toast.success("Chat session deleted");
                    } catch (err) {
                        console.error(err);
                        if (window.Toast) window.Toast.error("Failed to delete session");
                    }
                }, "Yes, Delete");
            };

            item.appendChild(btn);
            item.appendChild(del);
            sessionListContainer.appendChild(item);
        });
    } catch (err) {
        console.error("⚠️ Failed to load sessions:", err);
    }
}

// ... (Fungsi newChat dan loadChat tetap sama) ...
async function newChat() {
    // Panggil InputModal dari nav.js
    InputModal.show(
        "Give your chat a name:",       // Judul Modal
        "e.g. Tomato Disease Info...",  // Placeholder
        async (name) => {               // Callback saat user submit
            try {
                const res = await fetch("http://localhost:5000/chat/session", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name }),
                });

                const session = await res.json();
                currentSessionId = session.id;
                chatbox.innerHTML = "";

                await loadSessions();
                appendMessage("ai", `🪴 New chat **"${name}"** created. Ready to begin.`);

                // Opsional: Gunakan Toast jika ada
                if (window.Toast) window.Toast.success(`Chat "${name}" created!`);

            } catch (err) {
                console.error("⚠️ Could not create session:", err);
                if (window.Toast) window.Toast.error("Failed to create chat.");
            }
        },
        "Start Chat" // Teks tombol
    );
}

async function loadChat(id, name) {
    currentSessionId = id;
    chatbox.innerHTML = "";
    try {
        const res = await fetch(`http://localhost:5000/chat/history/${id}`);
        const history = await res.json();
        history.forEach((msg) => appendMessage(msg.role, msg.message));
        await loadSessions();
    } catch (err) { console.error(err); }
}

/* ------------------------------
   Clear Chat (UPDATED)
--------------------------------*/
function clearChat() {
    if (!currentSessionId) {
        if (window.Toast) window.Toast.warning("No chat selected.");
        else alert("No chat selected.");
        return;
    }

    // --- CUSTOM MODAL DI SINI ---
    ConfirmModal.show("Clear all messages in this chat?", async () => {
        try {
            await fetch(`http://localhost:5000/chat/session/${currentSessionId}`, {
                method: "DELETE",
            });
            chatbox.innerHTML = "";
            appendMessage("ai", "🧹 Chat cleared.");
            await loadSessions();
            if (window.Toast) window.Toast.success("Chat cleared");
        } catch (err) {
            console.error("⚠️ Failed to clear chat:", err);
            if (window.Toast) window.Toast.error("Failed to clear chat");
        }
    }, "Yes, Clear Chat");
}

// ... (Event listeners lainnya tetap sama) ...
sendBtn.addEventListener("click", async () => { /* ... logika send ... */ });
input.addEventListener("keypress", function (e) { /* ... logika enter ... */ });

window.addEventListener("DOMContentLoaded", async () => {
    await loadSessions();
    // ...
});