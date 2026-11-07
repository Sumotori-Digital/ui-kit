window.whenAlpine = function (register) {
    if (window.Alpine) register();
    else document.addEventListener('alpine:init', register);
};
(function () {
    try {
        var width = Number(localStorage.getItem('ui.sidebar.width'));
        if (width >= 208 && width <= 480) {
            document.documentElement.style.setProperty('--sidebar-width', Math.min(width, Math.max(208, Math.min(480, innerWidth - 360))) + 'px');
        }
        if (localStorage.getItem('ui.sidebar.collapsed') === 'true') {
            document.documentElement.classList.add('sidebar-collapsed');
            document.documentElement.style.setProperty('--sidebar-width', '72px');
        }
    } catch (error) {}
})();
(function () {
    var meta = document.querySelector('meta[name="ui-image-fallback"]');
    if (!meta) return;
    var pattern = new RegExp(meta.content);
    document.addEventListener('error', function (event) {
        var image = event.target;
        if (!(image instanceof HTMLImageElement)) return;
        var url = new URL(image.currentSrc || image.src, location.href);
        if (url.origin !== location.origin || url.searchParams.has('preview') || !pattern.test(url.pathname)) return;
        event.stopImmediatePropagation();
        url.searchParams.set('preview', 'true');
        image.removeAttribute('srcset');
        image.src = url.href;
    }, true);
})();
