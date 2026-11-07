(function () {
    var root = document.documentElement;
    var handle = document.getElementById("sidebar-resize-handle");
    var storageKey = "ui.sidebar.width";
    var preferredWidth = 256;
    var pointerId = null;
    var startPreferredWidth = 256;

    try {
        var savedWidth = Number(localStorage.getItem(storageKey));
        if (savedWidth >= 208 && savedWidth <= 480)
            preferredWidth = savedWidth;
    } catch (error) {}

    function maxWidth() {
        return Math.max(208, Math.min(480, innerWidth - 360));
    }

    function setWidth(width) {
        var value = Math.max(208, Math.min(maxWidth(), Math.round(width)));
        root.style.setProperty("--sidebar-width", value + "px");
        handle.setAttribute("aria-valuemax", String(maxWidth()));
        handle.setAttribute("aria-valuenow", String(value));
        return value;
    }

    function saveWidth() {
        try {
            localStorage.setItem(storageKey, String(preferredWidth));
        } catch (error) {}
    }

    function syncWidth() {
        if (root.classList.contains("sidebar-collapsed")) {
            root.style.setProperty("--sidebar-width", "72px");
        } else setWidth(preferredWidth);
    }

    window.syncSidebarWidth = syncWidth;
    syncWidth();
    window.addEventListener("resize", function () {
        syncWidth();
    });

    handle.addEventListener("pointerdown", function (event) {
        if (event.button !== 0 || !event.isPrimary) return;
        pointerId = event.pointerId;
        startPreferredWidth = preferredWidth;
        setWidth(preferredWidth);
        handle.setPointerCapture(pointerId);
        root.classList.add("sidebar-resizing");
        event.preventDefault();
    });

    handle.addEventListener("pointermove", function (event) {
        if (event.pointerId !== pointerId) return;
        preferredWidth = setWidth(event.clientX);
    });

    function finishResize(event) {
        if (event.pointerId !== pointerId) return;
        if (event.type === "pointercancel") {
            preferredWidth = startPreferredWidth;
            setWidth(preferredWidth);
        } else saveWidth();
        pointerId = null;
        root.classList.remove("sidebar-resizing");
        if (handle.hasPointerCapture(event.pointerId))
            handle.releasePointerCapture(event.pointerId);
    }

    handle.addEventListener("pointerup", finishResize);
    handle.addEventListener("pointercancel", finishResize);
    handle.addEventListener("lostpointercapture", finishResize);

    handle.addEventListener("keydown", function (event) {
        var width = Number(handle.getAttribute("aria-valuenow"));
        if (event.key === "ArrowLeft") width -= event.shiftKey ? 32 : 16;
        else if (event.key === "ArrowRight") width += event.shiftKey ? 32 : 16;
        else if (event.key === "Home") width = 208;
        else if (event.key === "End") width = maxWidth();
        else return;
        event.preventDefault();
        preferredWidth = setWidth(width);
        saveWidth();
    });
})();
(function () {
    var storageKey = "ui.sidebar.groups";
    var groups = document.querySelectorAll(
        "#sidebar .sidebar-group-toggle",
    );
    var root = document.documentElement;
    var collapse = document.getElementById("sidebar-collapse-toggle");
    var desktop = window.matchMedia("(min-width: 768px)");
    var saved = {};

    try {
        saved = JSON.parse(sessionStorage.getItem(storageKey)) || {};
    } catch (error) {
        saved = {};
    }

    function setExpanded(button, expanded) {
        var items = document.getElementById(
            button.getAttribute("aria-controls"),
        );
        button.setAttribute("aria-expanded", String(expanded));
        if (items) items.hidden = !expanded;
    }

    function syncGroups() {
        var compact = desktop.matches && root.classList.contains("sidebar-collapsed");
        groups.forEach(function (button) {
            var id = button.getAttribute("aria-controls");
            var items = document.getElementById(id);
            var expanded = compact || (Object.prototype.hasOwnProperty.call(saved, id)
                ? saved[id]
                : Boolean(items && items.querySelector("[aria-current='page']")));
            setExpanded(button, expanded);
        });
        var label = compact ? "Развернуть боковое меню" : "Свернуть боковое меню";
        collapse.setAttribute("aria-label", label);
        collapse.setAttribute("title", label);
    }

    var links = document.querySelectorAll("#sidebar nav li a");
    function syncLinkTitles() {
        var compact = desktop.matches && root.classList.contains("sidebar-collapsed");
        links.forEach(function (link) {
            var text = link.querySelector("span");
            if (compact && text) link.setAttribute("title", text.textContent.trim());
            else link.removeAttribute("title");
        });
    }

    groups.forEach(function (button) {
        var id = button.getAttribute("aria-controls");
        button.addEventListener("click", function () {
            var next = button.getAttribute("aria-expanded") !== "true";
            setExpanded(button, next);
            saved[id] = next;
            try {
                sessionStorage.setItem(storageKey, JSON.stringify(saved));
            } catch (error) {}
        });
    });

    collapse.addEventListener("click", function () {
        var compact = root.classList.toggle("sidebar-collapsed");
        try {
            localStorage.setItem("ui.sidebar.collapsed", String(compact));
        } catch (error) {}
        window.syncSidebarWidth();
        syncGroups();
        syncLinkTitles();
    });
    desktop.addEventListener("change", syncGroups);
    desktop.addEventListener("change", syncLinkTitles);
    syncGroups();
    syncLinkTitles();

    document
        .getElementById("sidebar")
        .classList.remove("sidebar-pending");
})();
(function () {
    var sidebar = document.getElementById("sidebar");
    var toggle = document.getElementById("sidebar-toggle");
    var desktop = window.matchMedia("(min-width: 768px)");

    function syncToggle() {
        var open = sidebar.getAttribute("aria-hidden") === "false";
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute(
            "aria-label",
            open ? "Закрыть меню" : "Открыть меню",
        );
    }

    new MutationObserver(syncToggle).observe(sidebar, {
        attributes: true,
        attributeFilter: ["aria-hidden"],
    });

    sidebar.addEventListener("basecoat:initialized", function () {
        syncToggle();
        desktop.addEventListener("change", function (event) {
            if (event.matches) sidebar.open();
            else sidebar.close();
        });
    });

    document.addEventListener("keydown", function (event) {
        if (
            event.key === "Escape" &&
            !desktop.matches &&
            sidebar.getAttribute("aria-hidden") === "false"
        ) {
            sidebar.close();
            toggle.focus();
        }
    });
})();
(function () {
    var root = document.documentElement;

    var alpineReady = new Promise(function (resolve) {
        document.addEventListener("alpine:initialized", resolve, { once: true });
    });
    var fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    var limit = new Promise(function (resolve) {
        setTimeout(resolve, 1500);
    });

    function showPage() {
        Promise.race([Promise.all([alpineReady, fontsReady]), limit]).then(function () {
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    root.classList.add("page-ready");
                });
            });
        });
    }

    function startLoading() {
        root.classList.remove("page-ready");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", showPage, {
            once: true,
        });
    } else {
        showPage();
    }

    window.addEventListener("pageshow", showPage);

    document.addEventListener("click", function (event) {
        if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        )
            return;

        var link = event.target.closest("a[href]");
        if (
            !link ||
            link.hasAttribute("download") ||
            (link.target && link.target !== "_self") ||
            link.matches(
                "[hx-get], [hx-post], [hx-put], [hx-patch], [hx-delete]",
            ) ||
            link.closest('[hx-boost="true"]')
        )
            return;

        var destination = new URL(link.href, window.location.href);
        if (
            destination.origin !== window.location.origin ||
            (destination.pathname === window.location.pathname &&
                destination.search === window.location.search &&
                destination.hash)
        )
            return;

        startLoading();
    });

    document.addEventListener("submit", function (event) {
        var form = event.target;
        if (
            event.defaultPrevented ||
            form.matches(
                "[hx-get], [hx-post], [hx-put], [hx-patch], [hx-delete]",
            )
        )
            return;
        startLoading();
    });
})();
(function () {
    var mac = /Mac|iPhone|iPad/.test(navigator.platform);
    var shortcut = mac ? "⌘ Enter" : "Ctrl + Enter";

    function mainForm(target) {
        var form = target.form || (target.closest && target.closest("form"));
        if (form) return form;
        if (document.querySelector("dialog[open]")) return null;
        var forms = document.querySelectorAll("main form:has(.form-actions)");
        return forms.length === 1 ? forms[0] : null;
    }

    document
        .querySelectorAll(".form-actions button[type=submit]:not([name])")
        .forEach(function (button) {
            if (!button.title) button.title = shortcut;
        });

    document.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
        var form = mainForm(event.target);
        if (!form) return;
        event.preventDefault();
        form.requestSubmit();
    });
})();
(function () {
    var trailKey = "ui.trail";
    var nextKey = "ui.trail.next";
    var limit = 30;

    function read(key) {
        try {
            return JSON.parse(sessionStorage.getItem(key));
        } catch (error) {
            return null;
        }
    }

    function write(key, value) {
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
        } catch (error) {}
    }

    function here() {
        return location.pathname + location.search + location.hash;
    }

    function path(url) {
        return url.split(/[?#]/)[0];
    }

    function plainClick(event) {
        return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
    }

    var trail = read(trailKey) || [];

    function top() {
        return trail[trail.length - 1];
    }

    function record() {
        var next = read(nextKey);
        sessionStorage.removeItem(nextKey);
        if (next && Date.now() - next.at > 30000) next = null;
        var entry = {url: here(), title: document.title};
        var dedupe = true;
        if (next && next.mode === "root") {
            trail = [];
        } else if (next && next.mode === "back") {
            trail.pop();
        } else if (next && next.mode === "submit" && (next.replace || next.deleted)) {
            trail.pop();
            dedupe = next.deleted || path(entry.url) !== next.action;
        }
        if (dedupe) {
            for (var i = 0; i < trail.length; i++) {
                if (path(trail[i].url) === path(entry.url)) {
                    trail = trail.slice(0, i);
                    break;
                }
            }
        }
        trail.push(entry);
        trail = trail.slice(-limit);
        write(trailKey, trail);
    }

    function linkBack() {
        var previous = trail[trail.length - 2];
        document.querySelectorAll(".page-back").forEach(function (link) {
            if (!link.dataset.fallback) link.dataset.fallback = link.getAttribute("href");
            if (!previous) {
                link.setAttribute("href", link.dataset.fallback);
                return;
            }
            link.setAttribute("href", previous.url);
            link.title = previous.title;
            var label = link.querySelector("span");
            if (label && path(previous.url) !== path(link.dataset.fallback)) label.textContent = "Назад";
        });
    }

    record();
    linkBack();

    window.addEventListener("pageshow", function (event) {
        if (!event.persisted) return;
        trail = read(trailKey) || [];
        record();
        linkBack();
    });

    window.addEventListener("pagehide", function () {
        trail = read(trailKey) || trail;
        if (top() && path(top().url) === location.pathname) {
            top().url = here();
            write(trailKey, trail);
        }
    });

    document.addEventListener("htmx:pushedIntoHistory", function () {
        if (top() && path(top().url) === location.pathname) {
            top().url = here();
            write(trailKey, trail);
        }
    });

    document.addEventListener("page:swapped", function () {
        trail = read(trailKey) || trail;
        record();
        linkBack();
    });

    document.addEventListener(
        "submit",
        function (event) {
            var form = event.target;
            if (event.defaultPrevented || form.method !== "post" || form.target) return;
            if (form.hasAttribute("hx-post") || form.closest("[hx-post]")) return;
            if (form.dataset.submitting) {
                event.preventDefault();
                return;
            }
            form.dataset.submitting = "true";
            setTimeout(function () {
                delete form.dataset.submitting;
            }, 8000);
        },
        false,
    );

    window.addEventListener("pageshow", function () {
        document.querySelectorAll("form[data-submitting]").forEach(function (form) {
            delete form.dataset.submitting;
        });
    });

    document.addEventListener("click", function (event) {
        if (!plainClick(event)) return;
        var link = event.target.closest && event.target.closest("a[href]");
        if (!link || link.target === "_blank") return;
        if (link.classList.contains("page-back") && trail.length > 1) {
            write(nextKey, {mode: "back", at: Date.now()});
        } else if (link.closest("#sidebar")) {
            write(nextKey, {mode: "root", at: Date.now()});
        }
    });

    document.addEventListener("submit", function (event) {
        if (event.defaultPrevented || event.target.target === "_blank") return;
        var form = event.target;
        var submitter = event.submitter;
        var action = submitter && submitter.hasAttribute("formaction") ? submitter.formAction : form.action;
        var primary = !!(form.querySelector(".form-actions") || (submitter && submitter.closest(".form-actions")));
        var actionPath = new URL(action, location.href).pathname;
        write(nextKey, {
            mode: "submit",
            action: actionPath,
            replace: primary && !form.closest("dialog"),
            deleted: actionPath === location.pathname + "/delete",
            at: Date.now()
        });
    });
})();
