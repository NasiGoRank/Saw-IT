(function () {
    // Cek apakah user sudah login
    const userSession = localStorage.getItem("irrigation_user");
    const currentPage = window.location.pathname.split("/").pop();

    // Jika TIDAK ada sesi user DAN bukan sedang di halaman login atau index (landing page)
    if (!userSession && currentPage !== "login.html" && currentPage !== "index.html" && currentPage !== "") {
        // Redirect paksa ke halaman login
        window.location.href = "login.html";
    }

    // (Opsional) Tampilkan nama user di Navbar jika elemennya ada
    if (userSession) {
        try {
            const user = JSON.parse(userSession);
            // Anda bisa menambahkan elemen dengan id "userNameDisplay" di navbar jika mau
            const display = document.getElementById("userNameDisplay");
            if (display) display.textContent = `Hi, ${user.username}`;
        } catch (e) {
            console.error("Invalid session");
            localStorage.removeItem("irrigation_user");
            window.location.href = "login.html";
        }
    }
})();

// Fungsi Logout global
function logout() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("irrigation_user");
        window.location.href = "login.html";
    }
}