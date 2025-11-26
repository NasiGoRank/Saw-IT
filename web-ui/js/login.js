const API_URL = "https://water-bender-service.onrender.com/api/auth/login";

document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const usernameIn = document.getElementById("username").value;
    const passwordIn = document.getElementById("password").value;
    const btn = e.target.querySelector("button");
    const errorMsg = document.getElementById("errorMsg");

    // Loading state
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Signing in...`;
    btn.disabled = true;
    errorMsg.classList.add("hidden");

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: usernameIn, password: passwordIn })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            // Simpan data user ke LocalStorage
            localStorage.setItem("irrigation_user", JSON.stringify(data.user));

            // Redirect ke Dashboard
            window.location.href = "home.html";
        } else {
            throw new Error(data.error || "Login failed");
        }
    } catch (err) {
        console.error("Login Error:", err);
        errorMsg.textContent = "❌ " + (err.message || "Connection failed");
        errorMsg.classList.remove("hidden");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

// Cek jika sudah login, langsung lempar ke dashboard
if (localStorage.getItem("irrigation_user")) {
    window.location.href = "dashboard.html";
}