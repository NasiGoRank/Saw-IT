/*
  Web-UI runtime config (NOT a secret).
  Anything used in browser JS is always visible to users.

  Change WB_API_ORIGIN to point to your backend.
  - Example: "https://water-bender-service.onrender.com"
  - If you serve the web-ui from the SAME domain as the backend, you can set this to "" (empty string)
*/
(function () {
  window.WB_API_ORIGIN = window.WB_API_ORIGIN || "https://water-bender-service.onrender.com"; //Sesuaikan dengan URL backend Anda
  // Small helper so other scripts can do: wbApi('/api/auth/login')
  window.wbApi = function (path) {
    var base = window.WB_API_ORIGIN || "";
    if (!path) return base;
    if (path[0] !== "/") path = "/" + path;
    return base + path;
  };
})();
