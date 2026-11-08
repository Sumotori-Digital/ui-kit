(function () {
    var identity = document.querySelector('meta[name="ui-user"]');
    if (!identity || !identity.content) return;
    var prefix = 'ui.workspace.' + encodeURIComponent(identity.content) + '.';
    var lifetime = 2 * 60 * 60 * 1000;
    var forms = new WeakMap();
    var restoring = false;
    var timer;
    var notice;
    var currentPage = location.pathname + location.search;

    function read(key) {
        try { return JSON.parse(sessionStorage.getItem(prefix + key)) || {}; } catch (_) { return {}; }
    }
    function write(key, value) {
        try { sessionStorage.setItem(prefix + key, JSON.stringify(value)); return true; } catch (_) { return false; }
    }
    function remove(key) { try { sessionStorage.removeItem(prefix + key); } catch (_) {} }
    function here() { return location.pathname + location.search + location.hash; }
    function controls(form) {
        return Array.from(form.elements).filter(function (input) {
            return (input.name || input.id) && !input.name.startsWith('_') && !input.closest('[data-popover]') && !['password', 'file', 'submit', 'button', 'reset'].includes(input.type) &&
                !['version', 'confirmation', 'username'].includes(input.name) && !input.disabled && !input.closest('fieldset:disabled');
        });
    }
    function fields(form) {
        return controls(form).map(function (input) {
            return {name: input.name, id: input.id, type: input.type, value: input.value, checked: !!input.checked};
        });
    }
    function eligible(form) {
        return form && form.method === 'post' && !form.closest('dialog') && !form.hasAttribute('data-save-url') &&
            !form.hasAttribute('hx-post') && !form.querySelector('input[type=password]') && form.querySelector('.form-actions') &&
            new URL(form.action, location.href).origin === location.origin;
    }
    function key(form) { var url = new URL(form.action, location.href); return url.pathname + url.search + '#' + (form.id || 'main'); }
    function drafts() {
        var saved = read('forms');
        Object.keys(saved).forEach(function (id) { if (Date.now() - saved[id].at > lifetime) delete saved[id]; });
        return saved;
    }
    function save(form, submitted) {
        if (!eligible(form) || restoring) return;
        var state = forms.get(form);
        if (!state || (!submitted && !state.touched)) return;
        var values = fields(form);
        var saved = drafts();
        if (JSON.stringify(values) === state.initial && !submitted && !(saved[key(form)] && saved[key(form)].submitted)) delete saved[key(form)];
        else saved[key(form)] = {at: Date.now(), values: values, submitted: !!submitted || !!(saved[key(form)] && saved[key(form)].submitted)};
        if (!write('forms', saved)) return;
        if (submitted) write('pending', {key: key(form), at: Date.now()});
    }
    function discard(form) {
        var saved = drafts();
        delete saved[key(form)];
        write('forms', saved);
    }
    function restoreFields(form, values) {
        restoring = true;
        var applied = new Set();
        controls(form).forEach(function (input) {
            var matches = values.filter(function (item) { return (input.name ? item.name === input.name : !item.name && item.id === input.id) && item.type === input.type; });
            if (!matches.length) return;
            var choice = input.closest('.combobox, .select, .multi-select');
            if (choice && input.type === 'hidden' && 'value' in choice) {
                if (applied.has(choice)) return;
                applied.add(choice);
                choice.value = choice.matches('.multi-select') ? matches.map(function (item) { return item.value; }) : matches[0].value;
            } else if (input.type === 'checkbox' || input.type === 'radio') {
                var match = matches.find(function (item) { return item.value === input.value; });
                input.checked = !!(match && match.checked);
            } else input.value = matches[0].value;
            input.dispatchEvent(new Event('input', {bubbles: true}));
            input.dispatchEvent(new Event('change', {bubbles: true}));
        });
        form.querySelectorAll('.multi-select[data-name]').forEach(function (choice) {
            if (choice.closest('fieldset:disabled')) return;
            choice.querySelectorAll('input[data-selected-id]').forEach(function (input) { input.remove(); });
            values.filter(function (item) { return item.name === choice.dataset.name && item.type === 'hidden'; }).forEach(function (item) {
                var available = Array.from(choice.querySelectorAll('[role=option][data-id]')).some(function (option) { return option.dataset.id === item.value; });
                if (!available) return;
                var input = document.createElement('input');
                input.type = 'hidden'; input.name = item.name; input.value = item.value; input.dataset.selectedId = '';
                choice.appendChild(input);
            });
            choice.dispatchEvent(new Event('change', {bubbles: true}));
        });
        restoring = false;
        forms.get(form).touched = true;
        save(form, false);
    }
    function button(label, action) {
        var result = document.createElement('button');
        result.type = 'button';
        result.className = 'btn';
        result.dataset.variant = 'outline';
        result.textContent = label;
        result.addEventListener('click', action);
        return result;
    }
    function prepareForms() {
        document.querySelectorAll('main form').forEach(function (form) {
            if (!eligible(form) || forms.has(form)) return;
            forms.set(form, {initial: JSON.stringify(fields(form)), touched: false});
            if (returned === key(form)) {
                discard(form);
                return;
            }
            var draft = drafts()[key(form)];
            if (!draft) return;
            var banner = document.createElement('div');
            banner.className = 'workspace-recovery';
            banner.setAttribute('role', 'status');
            var text = document.createElement('p');
            text.textContent = draft.submitted
                ? 'Результат прошлой отправки не подтверждён. Проверьте запись перед повторным сохранением.'
                : 'Есть несохранённый черновик этой формы.';
            banner.appendChild(text);
            banner.appendChild(button('Восстановить поля', function () { restoreFields(form, draft.values); banner.remove(); }));
            banner.appendChild(button('Удалить черновик', function () { discard(form); banner.remove(); }));
            form.prepend(banner);
        });
    }
    function savePage() {
        var states = read('pages');
        var tabs = Array.from(document.querySelectorAll('main button[role=tab][aria-selected=true][aria-controls]')).map(function (tab) { return tab.id; }).filter(Boolean);
        states[currentPage] = {at: Date.now(), y: scrollY, hash: location.hash, tabs: tabs,
            tables: Array.from(document.querySelectorAll('main .table-container')).map(function (table) { return table.scrollLeft; })};
        Object.keys(states).sort(function (a, b) { return states[b].at - states[a].at; }).slice(30).forEach(function (id) { delete states[id]; });
        write('pages', states);
        document.querySelectorAll('main form').forEach(function (form) { save(form, false); });
    }
    function restorePage() {
        if (document.querySelector('main[data-reset-context="true"]')) return;
        var saved = read('pages')[location.pathname + location.search];
        if (!saved || Date.now() - saved.at > lifetime || (location.hash && location.hash !== saved.hash)) return;
        var expected = here();
        requestAnimationFrame(function () {
            if (here() !== expected) return;
            if (!location.hash) saved.tabs.forEach(function (id) { var tab = document.getElementById(id); if (tab) tab.click(); });
            expected = here();
            requestAnimationFrame(function () {
                if (here() !== expected) return;
                document.querySelectorAll('main .table-container').forEach(function (table, index) { table.scrollLeft = saved.tables[index] || 0; });
                window.scrollTo(0, saved.y || 0);
            });
        });
    }
    function connection(url) {
        if (notice) notice.remove();
        notice = document.createElement('div');
        notice.className = 'workspace-connection';
        notice.setAttribute('role', 'status');
        var text = document.createElement('p');
        text.textContent = url ? 'Не удалось открыть страницу. Введённые данные остаются в текущей форме.' : 'Нет связи. Текущий ввод остаётся в форме.';
        notice.appendChild(text);
        if (url && new URL(url, location.href).origin === location.origin) {
            var retry = document.createElement('a');
            retry.href = url;
            retry.className = 'btn';
            retry.dataset.variant = 'outline';
            retry.textContent = 'Повторить открытие';
            notice.appendChild(retry);
        }
        notice.appendChild(button('Закрыть', function () { notice.remove(); notice = null; }));
        var main = document.querySelector('main');
        if (main) main.prepend(notice);
    }
    var arrival = window.performance && window.performance.getEntriesByType ? (window.performance.getEntriesByType('navigation')[0] || {}).type : '';
    var result = document.querySelector('meta[name="ui-save-result"]');
    var pending = arrival === 'back_forward' ? {} : read('pending');
    var returned = null;
    if (pending.key) {
        remove('pending');
        if (Date.now() - pending.at <= lifetime) {
            if (result && result.content === 'success') {
                var saved = drafts();
                delete saved[pending.key];
                write('forms', saved);
            } else returned = pending.key;
        }
    }
    function setup(fromHistory) { currentPage = location.pathname + location.search; prepareForms(); returned = null; requestAnimationFrame(rebase); if (fromHistory) restorePage(); }
    function touch(event) {
        var state = event.isTrusted && event.target.form && forms.get(event.target.form);
        if (state) state.touched = true;
    }
    function rebase() {
        document.querySelectorAll('main form').forEach(function (form) {
            var state = forms.get(form);
            if (state && !state.touched) state.initial = JSON.stringify(fields(form));
        });
    }
    document.addEventListener('input', function (event) {
        touch(event);
        if (!eligible(event.target.form)) return;
        clearTimeout(timer);
        var form = event.target.form;
        timer = setTimeout(function () { save(form, false); }, 250);
    });
    document.addEventListener('change', function (event) { touch(event); if (event.target.form) save(event.target.form, false); });
    document.addEventListener('alpine:initialized', rebase);
    document.addEventListener('submit', function (event) {
        if (!event.defaultPrevented && eligible(event.target)) save(event.target, true);
        if (new URL(event.target.action, location.href).pathname.endsWith('/logout')) {
            remove('forms');
            remove('pages');
            remove('pending');
        }
    });
    document.addEventListener('workspace:before-navigation', savePage);
    document.addEventListener('workspace:navigation-failed', function (event) { savePage(); connection(event.detail.url); });
    document.addEventListener('page:swapped', function (event) { notice = null; setup(!!(event.detail && event.detail.fromHistory)); });
    document.addEventListener('htmx:afterSettle', prepareForms);
    window.addEventListener('pagehide', savePage);
    window.addEventListener('offline', function () { savePage(); connection(); });
    window.addEventListener('online', function () { if (notice && !notice.querySelector('a')) { notice.remove(); notice = null; } });
    window.addEventListener('pageshow', function (event) { if (event.persisted) restorePage(); });
    setup(arrival === 'back_forward' || arrival === 'reload');
})();
