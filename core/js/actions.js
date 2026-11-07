(function () {
    var gap = 8;
    function position(menu) {
        if (!menu.open) return;
        var content = menu.querySelector('.action-menu-content');
        var trigger = menu.querySelector('summary');
        if (!content || !trigger) return;
        var viewport = window.visualViewport;
        var left = viewport ? viewport.offsetLeft : 0;
        var top = viewport ? viewport.offsetTop : 0;
        var width = viewport ? viewport.width : innerWidth;
        var height = viewport ? viewport.height : innerHeight;
        var rect = trigger.getBoundingClientRect();
        Object.assign(content.style, {position: 'fixed', right: 'auto', bottom: 'auto', maxWidth: Math.max(0, width - gap * 2) + 'px', maxHeight: Math.max(0, height - gap * 2) + 'px'});
        var x = Math.max(left + gap, Math.min(rect.right - content.offsetWidth, left + width - content.offsetWidth - gap));
        var below = top + height - rect.bottom - gap;
        var above = rect.top - top - gap;
        var up = below < content.offsetHeight && above > below;
        content.style.maxHeight = Math.max(0, Math.min(height - gap * 2, up ? above : below)) + 'px';
        content.style.left = x + 'px';
        var y = up ? rect.top - content.offsetHeight - gap : rect.bottom + gap;
        content.style.top = Math.max(top + gap, Math.min(y, top + height - content.offsetHeight - gap)) + 'px';
    }
    function close(except) {
        document.querySelectorAll('.action-menu[open]').forEach(function (menu) {
            if (menu !== except) menu.open = false;
        });
    }
    document.addEventListener('toggle', function (event) {
        if (event.target.matches('.action-menu')) position(event.target);
    }, true);
    document.addEventListener('click', function (event) {
        var menu = event.target.closest('.action-menu');
        close(menu);
        if (menu && event.target.closest('.action-menu-content a, .action-menu-content button')) menu.open = false;
    });
    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        var menu = event.target.closest('.action-menu[open]');
        if (!menu) return;
        event.preventDefault();
        event.stopPropagation();
        menu.open = false;
        menu.querySelector('summary').focus();
    });
    function reposition() {
        document.querySelectorAll('.action-menu[open]').forEach(position);
    }
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    if (window.visualViewport) {
        visualViewport.addEventListener('resize', reposition);
        visualViewport.addEventListener('scroll', reposition);
    }
})();
