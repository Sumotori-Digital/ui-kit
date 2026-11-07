(function () {
    var config = document.querySelector("[data-ui-navigation]");
    if (!config) return;
    var timer = null;
    var dirty = false;
    var current = null;
    var excluded = new RegExp(config.dataset.navigationExclude || "^$");
    var progress = document.getElementById("page-progress");
    var prefetched = null;
    var prefetchTimer = null;
    var prefetchLifetime = 10000;

    function boostable(link, event) {
        if (event.defaultPrevented || event.button !== 0) return false;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
        return swappable(link);
    }

    function swappable(link) {
        if (link.closest("#sidebar nav > footer, #sidebar nav > header")) return false;
        if (link.target || link.hasAttribute("download") || link.hasAttribute("onclick")) return false;
        if (link.closest("[hx-get], [hx-post], [hx-boost]")) return false;
        var href = link.getAttribute("href");
        if (!href || href.indexOf("#") >= 0) return false;
        var url = new URL(link.href);
        return url.origin === location.origin && !excluded.test(url.pathname);
    }

    function runScripts(container) {
        container.querySelectorAll("script").forEach(function (old) {
            var script = document.createElement("script");
            Array.from(old.attributes).forEach(function (attribute) {
                script.setAttribute(attribute.name, attribute.value);
            });
            script.textContent = old.textContent;
            old.replaceWith(script);
        });
    }

    function load(url, signal) {
        return fetch(url, { signal: signal, credentials: "same-origin" }).then(function (response) {
            if (!response.ok) throw new Error("navigation");
            return response.text().then(function (html) {
                return { html: html, url: response.url };
            });
        });
    }

    function dropPrefetch() {
        clearTimeout(prefetchTimer);
        if (prefetched) prefetched.controller.abort();
        prefetched = null;
    }

    function prefetch(url) {
        if (prefetched && prefetched.url === url) return;
        dropPrefetch();
        if (url === location.href) return;
        if (navigator.connection && navigator.connection.saveData) return;
        var controller = new AbortController();
        var promise = load(url, controller.signal);
        promise.catch(function () {});
        prefetched = { url: url, controller: controller, promise: promise, at: Date.now() };
    }

    function takePrefetched(url) {
        var taken = prefetched;
        prefetched = null;
        if (!taken) return null;
        if (taken.url === url && Date.now() - taken.at < prefetchLifetime) return taken.promise;
        taken.controller.abort();
        return null;
    }

    function linkOf(event) {
        return event.target.closest && event.target.closest("a[href]");
    }

    document.addEventListener("pointerover", function (event) {
        if (event.pointerType !== "mouse") return;
        var link = linkOf(event);
        if (!link || !swappable(link)) return;
        clearTimeout(prefetchTimer);
        prefetchTimer = setTimeout(function () {
            prefetch(link.href);
        }, 65);
    });
    document.addEventListener("pointerout", function (event) {
        if (linkOf(event)) clearTimeout(prefetchTimer);
    });
    document.addEventListener("touchstart", function (event) {
        var link = linkOf(event);
        if (link && swappable(link)) prefetch(link.href);
    }, { passive: true });
    document.addEventListener("htmx:beforeRequest", function (event) {
        if (event.detail.requestConfig.verb !== "get") dropPrefetch();
    });

    function finishProgress() {
        clearTimeout(timer);
        if (progress && progress.dataset.state === "loading") progress.dataset.state = "done";
    }

    function navigate(url, push) {
        if (current) current.abort();
        current = new AbortController();
        var request = current;
        clearTimeout(prefetchTimer);
        var ready = takePrefetched(url) || load(url, request.signal);
        clearTimeout(timer);
        if (window.markSidebarCurrent) window.markSidebarCurrent(new URL(url, location.href).pathname);
        timer = setTimeout(function () {
            if (progress) progress.dataset.state = "loading";
        }, 150);
        ready
            .then(function (result) {
                if (request !== current) return;
                var fresh = new DOMParser().parseFromString(result.html, "text/html").querySelector("link[rel=stylesheet]");
                var loaded = document.querySelector("link[rel=stylesheet]");
                if (fresh && loaded && fresh.getAttribute("href") !== loaded.getAttribute("href")) {
                    location.href = result.url;
                    return;
                }
                var parsed = new DOMParser().parseFromString(result.html, "text/html");
                var next = parsed.querySelector("main");
                var main = document.querySelector("main");
                if (!next || !main) throw new Error("navigation");
                var toast = parsed.querySelector("script[data-ui-toast]");
            var trailUrl = new URL(result.url);
                document.dispatchEvent(new CustomEvent("workspace:before-navigation"));
                if (push) history.pushState({}, "", trailUrl.pathname + trailUrl.search);
                document.title = parsed.title;
                main.replaceWith(next);
                runScripts(next);
                htmx.process(next);
                window.scrollTo(0, 0);
                if (window.markSidebarCurrent) window.markSidebarCurrent(location.pathname);
                finishProgress();
                dirty = false;
                if (toast) {
                    var script = document.createElement("script");
                    script.textContent = toast.textContent;
                    document.body.appendChild(script);
                    script.remove();
                }
                document.dispatchEvent(new CustomEvent("page:swapped", {detail: {fromHistory: !push}}));
            })
            .catch(function (error) {
                if (request !== current || error.name === "AbortError") return;
                finishProgress();
                if (error instanceof TypeError || !navigator.onLine) {
                    document.dispatchEvent(new CustomEvent("workspace:navigation-failed", {detail: {url: url}}));
                    return;
                }
                location.href = url;
            });
    }

    document.addEventListener(
        "click",
        function (event) {
            var link = event.target.closest && event.target.closest("a[href]");
            if (!link || !boostable(link, event)) return;
            event.preventDefault();
            if (dirty && !confirm("Есть несохранённые изменения. Уйти со страницы?")) {
                event.stopImmediatePropagation();
                return;
            }
            navigate(link.href, true);
        },
        true,
    );
    window.addEventListener("popstate", function (event) {
        if (event.state && event.state.htmx) return;
        navigate(location.href, false);
    });

    document.addEventListener("input", function (event) {
        var form = event.target.form;
        if (!form || form.method !== "post" || form.closest("dialog")) return;
        if (form.matches("[data-save-url], [data-navigation-ignore-dirty]")) return;
        dirty = true;
    });
    document.addEventListener("submit", function () {
        dirty = false;
        dropPrefetch();
    });
    window.addEventListener("beforeunload", function (event) {
        if (dirty) event.preventDefault();
    });
})();
