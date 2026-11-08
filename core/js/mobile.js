(function () {
    var small = window.matchMedia('(max-width: 767px)');
    var root = document.documentElement;
    var layered = typeof document.createElement('div').showPopover === 'function';
    var sequence = 0;
    var pending = false;
    var footers = new Set();
    var footerObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (layered) root.classList.add('ui-mobile-layer');

    function tables() {
        document.querySelectorAll('table[data-mobile="records"]:not([data-mobile-ready])').forEach(function (table) {
            var headers = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
            if (!headers) return;
            var labels = Array.from(headers.cells).map(function (cell, index) {
                if (!cell.id) cell.id = 'mobile-column-' + (++sequence) + '-' + index;
                return {label: cell.textContent.trim(), id: cell.id, priority: cell.hasAttribute('data-mobile-priority')};
            });
            Array.from(table.tBodies).concat(table.tFoot ? [table.tFoot] : []).forEach(function (body) {
                Array.from(body.rows).forEach(function (row) {
                    var position = 0;
                    Array.from(row.cells).forEach(function (cell) {
                        var index = position;
                        position += cell.colSpan || 1;
                        if (cell.colSpan > 1) return;
                        var header = labels[index];
                        if (!header) return;
                        if (header.label && !cell.hasAttribute('data-label')) cell.dataset.label = header.label;
                        if (!cell.hasAttribute('headers')) cell.setAttribute('headers', header.id);
                        if (!header.label || header.label === 'Действия') cell.dataset.mobileActions = '';
                        if (header.priority) cell.dataset.mobilePriority = '';
                    });
                });
            });
            table.dataset.mobileReady = '';
        });
    }

    function periods() {
        document.querySelectorAll('table[data-mobile="periods"]:not([data-mobile-ready])').forEach(function (table) {
            var heading = table.tHead && table.tHead.rows[0];
            if (!heading || heading.cells.length < 3) return;
            var columns = Array.from(heading.cells).slice(1, -1);
            var navigation = document.createElement('div');
            navigation.className = 'table-navigation';
            var label = document.createElement('label');
            var select = document.createElement('select');
            select.id = 'mobile-period-' + (++sequence);
            select.className = 'select';
            label.htmlFor = select.id;
            label.className = 'sr-only';
            label.textContent = 'Показать месяц';
            columns.forEach(function (cell, index) {
                var option = document.createElement('option');
                option.value = String(index + 1);
                option.textContent = cell.textContent.trim();
                select.appendChild(option);
            });
            var total = document.createElement('option');
            total.value = String(heading.cells.length - 1);
            total.textContent = heading.cells[heading.cells.length - 1].textContent.trim();
            select.appendChild(total);
            var all = document.createElement('option');
            all.value = 'all';
            all.textContent = 'Все месяцы';
            select.appendChild(all);
            select.value = total.value;
            function update() {
                Array.from(table.rows).forEach(function (row) {
                    Array.from(row.cells).forEach(function (cell, index) {
                        if (cell.colSpan > 1 && !cell.dataset.periodColspan) cell.dataset.periodColspan = String(cell.colSpan);
                        if (cell.dataset.periodColspan) cell.colSpan = select.value === 'all' ? Number(cell.dataset.periodColspan) : 2;
                        var hidden = select.value !== 'all' && !cell.dataset.periodColspan && index > 0 && index !== Number(select.value);
                        cell.toggleAttribute('data-mobile-hidden', hidden);
                    });
                });
            }
            select.addEventListener('change', update);
            navigation.appendChild(label);
            navigation.appendChild(select);
            table.parentElement.insertBefore(navigation, table);
            table.dataset.mobileReady = '';
            update();
        });
    }

    function tabs() {
        if (!small.matches) return;
        document.querySelectorAll('.tabs > [role="tablist"]').forEach(function (list) {
            var active = list.querySelector('[aria-selected="true"], [aria-current="page"]');
            if (!active) return;
            var key = active.id || active.textContent.trim();
            if (list.dataset.mobileAligned === key) return;
            var start = active.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
            var visible = start >= list.scrollLeft && start + active.offsetWidth <= list.scrollLeft + list.clientWidth;
            if (!visible) list.scrollLeft = Math.max(0, start - (list.clientWidth - active.offsetWidth) / 2);
            list.dataset.mobileAligned = key;
        });
    }

    function viewport() {
        var view = window.visualViewport;
        var height = view ? view.height : innerHeight;
        var top = view ? view.offsetTop : 0;
        root.style.setProperty('--ui-viewport-height', height + 'px');
        root.style.setProperty('--ui-viewport-top', top + 'px');
        var control = document.activeElement;
        var editing = control && control.matches('input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable="true"]');
        root.toggleAttribute('data-keyboard-open', !!editing && innerHeight - height > 150);
        var footerHeight = 0;
        if (small.matches) {
            document.querySelectorAll('.form-actions').forEach(function (footer) {
                var rect = footer.getBoundingClientRect();
                if (rect.height && rect.top < top + height && rect.bottom > top) footerHeight = Math.max(footerHeight, Math.min(rect.height + 16, height / 3));
            });
        }
        root.style.setProperty('--ui-action-height', footerHeight + 'px');
    }

    function popup(popover) {
        if (!layered || !small.matches) return;
        var open = popover.getAttribute('aria-hidden') === 'false';
        if (!open) {
            if (popover.matches(':popover-open')) popover.hidePopover();
            return;
        }
        var host = popover.closest('.combobox, .select, .multi-select, .date-picker, .month-picker');
        if (!host) return;
        if (!host.getClientRects().length) {
            if (popover.matches(':popover-open')) popover.hidePopover();
            if (typeof host.close === 'function') host.close();
            else popover.setAttribute('aria-hidden', 'true');
            return;
        }
        if (!popover.hasAttribute('data-mobile-layer')) {
            popover.mobileOriginalStyle = popover.getAttribute('style');
            popover.dataset.mobileLayer = '';
            popover.setAttribute('popover', 'manual');
        }
        var view = window.visualViewport;
        var start = view ? view.offsetLeft : 0;
        var top = view ? view.offsetTop : 0;
        var width = view ? view.width : innerWidth;
        var height = view ? view.height : innerHeight;
        var trigger = host.querySelector(':scope > button[aria-haspopup], :scope > .input-group, :scope > input[role=combobox]') || host;
        var rect = trigger.getBoundingClientRect();
        var calendar = host.matches('.date-picker, .month-picker');
        var size = Math.min(width - 16, calendar ? 360 : Math.max(rect.width, Math.min(320, width - 16)));
        Object.assign(popover.style, {position: 'fixed', right: 'auto', bottom: 'auto', margin: '0', width: size + 'px', maxWidth: Math.max(0, width - 16) + 'px', transform: 'none', translate: 'none', scale: 'none'});
        if (!popover.matches(':popover-open')) popover.showPopover();
        var below = Math.max(0, top + height - rect.bottom - 8);
        var above = Math.max(0, rect.top - top - 8);
        var up = below < Math.min(popover.scrollHeight, 280) && above > below;
        var available = Math.max(0, Math.min(height - 16, up ? above : below));
        popover.style.maxHeight = available + 'px';
        var list = popover.querySelector('[role=listbox]');
        if (list) {
            var other = Math.max(0, popover.scrollHeight - list.scrollHeight);
            popover.style.setProperty('--available-height', Math.max(0, available - other) + 'px');
        }
        popover.style.left = Math.max(start + 8, Math.min(rect.left, start + width - size - 8)) + 'px';
        var y = up ? rect.top - popover.offsetHeight - 8 : rect.bottom + 8;
        popover.style.top = Math.max(top + 8, Math.min(y, top + height - popover.offsetHeight - 8)) + 'px';
    }

    function restorePopups() {
        if (small.matches) return;
        document.querySelectorAll('[data-popover][data-mobile-layer]').forEach(function (popover) {
            var host = popover.closest('.combobox, .select, .multi-select');
            if (host && typeof host.close === 'function') host.close();
            if (popover.matches(':popover-open')) popover.hidePopover();
            popover.removeAttribute('popover');
            delete popover.dataset.mobileLayer;
            if (popover.mobileOriginalStyle == null) popover.removeAttribute('style');
            else popover.setAttribute('style', popover.mobileOriginalStyle);
        });
    }

    function layout() {
        pending = false;
        viewport();
        document.querySelectorAll('[data-popover][aria-hidden="false"]').forEach(popup);
    }
    function schedule() {
        if (pending) return;
        pending = true;
        requestAnimationFrame(layout);
    }
    function setup() {
        if (footerObserver) {
            footers.forEach(function (footer) {
                if (!footer.isConnected) { footerObserver.unobserve(footer); footers.delete(footer); }
            });
            document.querySelectorAll('.form-actions').forEach(function (footer) {
                if (!footers.has(footer)) { footers.add(footer); footerObserver.observe(footer); }
            });
        }
        tables();
        periods();
        tabs();
        schedule();
    }
    new MutationObserver(function (records) {
        records.forEach(function (record) {
            if (record.target.matches('[data-popover]')) popup(record.target);
        });
    }).observe(root, {attributes: true, attributeFilter: ['aria-hidden'], subtree: true});
    document.addEventListener('page:swapped', setup);
    document.addEventListener('htmx:afterSwap', setup);
    document.addEventListener('htmx:afterSettle', setup);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    document.addEventListener('toast', schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    small.addEventListener('change', function () { restorePopups(); setup(); });
    if (window.visualViewport) {
        visualViewport.addEventListener('resize', schedule);
        visualViewport.addEventListener('scroll', schedule);
    }
    setup();
})();
