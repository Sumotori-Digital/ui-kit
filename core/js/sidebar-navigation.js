(function () {
    var sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    window.markSidebarCurrent = function (path) {
        var best = null;
        var bestLength = 0;
        sidebar.querySelectorAll("[data-nav-paths]").forEach(function (link) {
            link.removeAttribute("aria-current");
            link.dataset.navPaths.split(" ").forEach(function (target) {
                var match = path === target || path.indexOf(target + "/") === 0;
                if (match && target.length > bestLength) {
                    best = link;
                    bestLength = target.length;
                }
            });
        });
        if (best) best.setAttribute("aria-current", "page");
    };
    markSidebarCurrent(location.pathname);
    sidebar.classList.remove("sidebar-pending");
    var list = sidebar.querySelector("nav > section");
    if (!list) return;
    try {
        list.scrollTop = Number(sessionStorage.getItem("ui.sidebar.scroll")) || 0;
    } catch (error) {}
    var current = list.querySelector("[aria-current='page']");
    if (current) {
        var bounds = list.getBoundingClientRect();
        var rect = current.getBoundingClientRect();
        if (rect.top < bounds.top) list.scrollTop -= bounds.top - rect.top + 8;
        else if (rect.bottom > bounds.bottom) list.scrollTop += rect.bottom - bounds.bottom + 8;
    }
    addEventListener("pagehide", function () {
        try {
            sessionStorage.setItem("ui.sidebar.scroll", String(list.scrollTop));
        } catch (error) {}
    });
})();
