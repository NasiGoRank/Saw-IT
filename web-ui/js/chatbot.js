const chatbox = document.getElementById("chatbox");
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

let sessionListContainer = document.getElementById("chatSessions");
let currentSessionId = null;

// --- Helper: Append Message to Chatbox ---
function appendMessage(sender, text) {
    const bubble = document.createElement("div");
    bubble.className = sender === "user" ? "text-right mb-3 message-user" : "text-left mb-3 message-assistant";

    // Gunakan marked.parse jika library marked tersedia (untuk format bold/list), jika tidak text biasa
    const content = typeof marked !== 'undefined' ? marked.parse(text) : text;

    bubble.innerHTML = `
    <div class="inline-block px-4 py-2 rounded-xl ${sender === "user" ? "bg-green-600 text-white" : "bg-gray-700 text-gray-200"} max-w-[80%] text-left prose prose-invert">
      ${content}
    </div>`;

    chatbox.appendChild(bubble);
    chatbox.scrollTop = chatbox.scrollHeight;
}

// --- Load All Chat Sessions ---
async function loadSessions() {
    try {
        // URL SUDAH BENAR (RENDER)
        const res = await fetch("https://water-bender-service.onrender.com/chat/sessions");
        const sessions = await res.json();

        if (!sessionListContainer) return;
        sessionListContainer.innerHTML = "";

        sessions.forEach((s) => {
            const item = document.createElement("div");
            const isActive = s.id === currentSessionId;

            item.className = `flex justify-between items-center px-3 py-2 rounded transition cursor-pointer ${isActive ? "bg-green-900/40 border border-green-600" : "hover:bg-gray-800"}`;

            const btn = document.createElement("span");
            btn.textContent = s.name;
            btn.className = `flex-1 text-left truncate text-sm ${isActive ? "text-green-400 font-semibold" : "text-gray-300"}`;
            item.onclick = () => loadChat(s.id, s.name);

            const del = document.createElement("button");
            del.className = "ml-2 text-gray-500 hover:text-red-400 transition";
            del.innerHTML = `<i class="fas fa-trash text-xs"></i>`;

            // Delete Session Logic
            del.onclick = (e) => {
                e.stopPropagation();
                ConfirmModal.show(`Delete chat session "${s.name}"?`, async () => {
                    try {
                        await fetch(`https://water-bender-service.onrender.com/chat/session/${s.id}`, { method: "DELETE" });

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

// --- Create New Chat ---
async function newChat() {
    InputModal.show(
        "New Chat Session",
        "Enter chat topic (e.g. Plant Disease)...",
        async (name) => {
            try {
                const res = await fetch("https://water-bender-service.onrender.com/chat/session", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name }),
                });

                const session = await res.json();
                currentSessionId = session.id;
                chatbox.innerHTML = "";

                await loadSessions();
                appendMessage("ai", `🌱 **${name}** created. How can I help you with this topic?`);

                if (window.Toast) window.Toast.success("New chat created!");

            } catch (err) {
                console.error("Create chat error:", err);
                if (window.Toast) window.Toast.error("Failed to create chat.");
            }
        },
        "Start Chat"
    );
}

// --- Load Chat History ---
async function loadChat(id, name) {
    currentSessionId = id;
    chatbox.innerHTML = ""; // Clear current view
    try {
        const res = await fetch(`https://water-bender-service.onrender.com/chat/history/${id}`);
        const history = await res.json();
        history.forEach((msg) => appendMessage(msg.role, msg.message));

        // Highlight active session in sidebar
        loadSessions();
    } catch (err) { console.error(err); }
}

// --- Clear Chat Messages ---
function clearChat() {
    if (!currentSessionId) {
        if (window.Toast) window.Toast.warning("No chat selected.");
        return;
    }

    ConfirmModal.show("Clear all messages in this chat?", async () => {
        try {
            await fetch(`https://water-bender-service.onrender.com/chat/session/${currentSessionId}`, {
                method: "DELETE",
            });
            chatbox.innerHTML = "";
            appendMessage("ai", "🧹 Chat history cleared.");
            await loadSessions(); // Refresh sidebar (optional)
        } catch (err) {
            console.error("Clear chat error:", err);
            if (window.Toast) window.Toast.error("Failed to clear chat");
        }
    }, "Yes, Clear");
}

// --- SEND MESSAGE LOGIC (INI YANG HILANG TADI) ---
// Fungsi ini yang menghubungkan tombol kirim dengan backend AI
async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    if (!currentSessionId) {
        if (window.Toast) window.Toast.warning("Please create or select a chat session first!");
        else alert("Please create a chat session first.");
        return;
    }

    // 1. Tampilkan pesan user
    appendMessage("user", text);
    input.value = "";

    // Loading indicator sederhana
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "text-left mb-3 message-assistant text-gray-400 text-sm italic";
    loadingDiv.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-2"></i> AI is thinking...`;
    chatbox.appendChild(loadingDiv);
    chatbox.scrollTop = chatbox.scrollHeight;

    try {
        // 2. Kirim ke Backend (URL RENDER)
        const res = await fetch("https://water-bender-service.onrender.com/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                session_id: currentSessionId
            }),
        });

        const data = await res.json();

        // Hapus loading
        loadingDiv.remove();

        // 3. Tampilkan balasan AI
        if (data.reply) {
            appendMessage("ai", data.reply);
        } else {
            appendMessage("ai", "⚠️ No response from AI.");
        }

    } catch (err) {
        loadingDiv.remove();
        console.error(err);
        appendMessage("ai", "❌ Error connecting to AI service.");
    }
}

// --- Event Listeners (SEKARANG SUDAH DIISI) ---
sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keypress", function (e) {
    if (e.key === "Enter") sendMessage();
});

// Init
window.addEventListener("DOMContentLoaded", async () => {
    await loadSessions();
});