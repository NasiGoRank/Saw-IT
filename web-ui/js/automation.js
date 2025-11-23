const API_URL = "https://water-bender-service.onrender.com/api/schedules";

// --- UI Logic ---
document.getElementById("type").addEventListener("change", (e) => {
    const type = e.target.value;
    document.getElementById("datetimeField").classList.toggle("hidden", type !== "once");
    document.getElementById("dailyField").classList.toggle("hidden", type !== "daily");
    document.getElementById("hourlyField").classList.toggle("hidden", type !== "hourly");
    document.getElementById("weeklyField").classList.toggle("hidden", type !== "weekly");
});

// --- Add Schedule ---
document.getElementById("scheduleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = document.getElementById("type").value;
    const duration = document.getElementById("duration").value;
    const keep_after_run = document.getElementById("keepAfterRun").checked ? 1 : 0;

    let payload = { type, duration, keep_after_run };

    if (type === "once") payload.datetime = document.getElementById("datetime").value;
    if (type === "daily") payload.datetime = document.getElementById("dailyTime").value;
    if (type === "hourly") payload.repeat_interval = document.getElementById("interval").value;
    if (type === "weekly") {
        payload.weekday = document.getElementById("weekday").value;
        payload.datetime = document.getElementById("weeklyTime").value;
    }

    try {
        await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (window.Toast) window.Toast.success("Schedule added successfully");
        e.target.reset();
        loadSchedules();
    } catch (err) {
        console.error(err);
        if (window.Toast) window.Toast.error("Failed to add schedule");
    }
});

// --- AI Button ---
document.getElementById("autoScheduleBtn").addEventListener("click", async (e) => {
    const btn = e.target;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Generating...`;

    try {
        const soilText = document.getElementById("soilValue")?.textContent || "40%";
        const rainText = document.getElementById("rainValue")?.textContent || "10%";
        const soil = parseInt(soilText.replace("%", "")) || 40;
        const rain = parseInt(rainText.replace("%", "")) || 10;
        const locationQuery = localStorage.getItem('esp_public_ip') || 'Jakarta';

        const res = await fetch("https://water-bender-service.onrender.com/api/auto-schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ soil, rain, location: locationQuery })
        });

        const data = await res.json();

        if (data.success) {
            if (window.Toast) window.Toast.success(`AI generated ${data.generated || 0} schedules!`);
            loadSchedules();
        } else {
            if (window.Toast) window.Toast.warning(data.message || "No schedule needed.");
        }
    } catch (err) {
        console.error("AI Schedule Error:", err);
        if (window.Toast) window.Toast.error("AI service unavailable");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// --- Load Schedules (RESPONSIVE UPDATE) ---
async function loadSchedules() {
    const container = document.getElementById("scheduleListContainer"); // New container ID

    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        container.innerHTML = "";

        if (data.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 border-2 border-dashed border-gray-700 rounded-xl text-gray-500">
                    <i class="fas fa-calendar-times text-4xl mb-3 opacity-50"></i>
                    <p>No active schedules.</p>
                </div>`;
            return;
        }

        data.forEach(s => {
            let pattern = "-";
            let icon = "fa-clock";
            let typeLabel = s.type;
            let typeClass = "bg-gray-700 text-gray-300";

            if (s.type === "once") {
                pattern = new Date(s.datetime).toLocaleString();
                icon = "fa-hourglass-start";
                typeLabel = "One-Time";
                typeClass = "bg-blue-900/40 text-blue-400 border border-blue-800";
            } else if (s.type === "daily") {
                pattern = `Daily at ${s.datetime}`;
                icon = "fa-calendar-day";
                typeLabel = "Daily";
                typeClass = "bg-green-900/40 text-green-400 border border-green-800";
            } else if (s.type === "hourly") {
                pattern = `Every ${s.repeat_interval} hour(s)`;
                icon = "fa-history";
                typeLabel = "Hourly";
                typeClass = "bg-purple-900/40 text-purple-400 border border-purple-800";
            } else if (s.type === "weekly") {
                pattern = `${s.weekday} at ${s.datetime}`;
                icon = "fa-calendar-week";
                typeLabel = "Weekly";
                typeClass = "bg-orange-900/40 text-orange-400 border border-orange-800";
            }

            const item = document.createElement("div");
            item.className = "relative flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-gray-800/40 border border-gray-700 rounded-xl hover:bg-gray-800/60 transition gap-4";

            item.innerHTML = `
                <div class="flex items-center gap-4 w-full md:w-auto">
                    <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
                        <i class="fas ${icon} text-gray-300"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${typeClass}">${typeLabel}</span>
                            ${s.keep_after_run ? '<span class="text-xs text-gray-500" title="Kept after run"><i class="fas fa-save"></i></span>' : ''}
                        </div>
                        <p class="text-sm text-gray-300 font-medium truncate">${pattern}</p>
                    </div>
                </div>

                <div class="flex items-center justify-between w-full md:w-auto gap-6 pl-14 md:pl-0">
                    <div class="flex flex-col">
                        <span class="text-[10px] text-gray-500 uppercase font-bold">Duration</span>
                        <span class="text-sm font-mono text-white">${s.duration}m</span>
                    </div>
                    
                    <button onclick="deleteSchedule(${s.id})" 
                        class="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition" 
                        title="Delete Schedule">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    } catch (err) {
        console.error("Load Error:", err);
        container.innerHTML = `<div class="text-center py-4 text-red-400">Failed to load schedules.</div>`;
    }
}

// --- Delete Schedule (Updated) ---
async function deleteSchedule(id) {
    if (typeof ConfirmModal !== 'undefined') {
        ConfirmModal.show("Delete this schedule?", async () => {
            await fetch(`${API_URL}/${id}`, { method: "DELETE" });
            if (window.Toast) window.Toast.success("Schedule deleted");
            loadSchedules();
        }, "Yes, Delete");
    } else {
        if (confirm("Delete schedule?")) {
            await fetch(`${API_URL}/${id}`, { method: "DELETE" });
            loadSchedules();
        }
    }
}

loadSchedules();