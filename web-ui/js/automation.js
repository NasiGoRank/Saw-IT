const API_URL = "http://localhost:5000/api/schedules";

document.getElementById("type").addEventListener("change", (e) => {
    const type = e.target.value;
    document.getElementById("datetimeField").classList.toggle("hidden", type !== "once");
    document.getElementById("dailyField").classList.toggle("hidden", type !== "daily");
    document.getElementById("hourlyField").classList.toggle("hidden", type !== "hourly");
    document.getElementById("weeklyField").classList.toggle("hidden", type !== "weekly");
});

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

    await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    e.target.reset();
    loadSchedules();
});

// ===== AUTO SCHEDULE (AI) BUTTON =====
document.getElementById("autoScheduleBtn").addEventListener("click", async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = "Generating...";
    try {
        // Get soil and rain values directly from dashboard elements (if available)
        const soilText = document.getElementById("soilValue")?.textContent || "40%";
        const rainText = document.getElementById("rainValue")?.textContent || "10%";

        const soil = parseInt(soilText.replace("%", "")) || 40;
        const rain = parseInt(rainText.replace("%", "")) || 10;

        // Send directly to AI auto-schedule route
        const res = await fetch("http://localhost:5000/api/auto-schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ soil, rain })
        });

        const data = await res.json();

        if (data.success) {
            alert(`✅ AI successfully generated ${data.generated || 0} schedule(s).`);
            loadSchedules(); // refresh schedule list
        } else {
            alert("⚠️ Failed to create schedule automatically.\n" + (data.error || ""));
        }
    } catch (err) {
        console.error("AI Schedule Error:", err);
        alert("⚠️ Failed to create schedule automatically.");
    } finally {
        btn.disabled = false;
        btn.textContent = "Generate Auto Schedule (AI)";
    }
});


async function loadSchedules() {
    const res = await fetch(API_URL);
    const data = await res.json();
    const list = document.getElementById("scheduleList");
    list.innerHTML = "";

    if (data.length === 0) {
        list.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-gray-500">No schedules yet</td></tr>`;
        return;
    }

    data.forEach(s => {
        let pattern = "-";
        if (s.type === "once") pattern = s.datetime;
        else if (s.type === "daily") pattern = `Every day at ${s.datetime}`;
        else if (s.type === "hourly") pattern = `Every ${s.repeat_interval} hour(s)`;
        else if (s.type === "weekly") pattern = `${s.weekday} at ${s.datetime}`;

        list.innerHTML += `
      <tr class="border-t border-gray-700 hover:bg-gray-800/30 transition">
        <td class="p-2 font-semibold">${s.type}</td>
        <td class="p-2">${pattern}</td>
        <td class="p-2">${s.duration} min</td>
        <td class="p-2">${s.keep_after_run ? "✅" : "❌"}</td>
        <td class="p-2 text-center">
          <button class="text-red-400 hover:text-red-600" onclick="deleteSchedule(${s.id})">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>`;
    });
}

async function deleteSchedule(id) {
    await fetch(`${API_URL}/${id}`, { method: "DELETE" });
    loadSchedules();
}

loadSchedules();
