(function () {
    function close(except) {
        document.querySelectorAll('.action-menu[open]').forEach(function (menu) {
            if (menu !== except) menu.open = false;
        });
    }
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
})();
