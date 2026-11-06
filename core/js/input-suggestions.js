(function () {
    var inputs = new WeakMap();
    var states = new Set();
    var sequence = 0;
    var gap = 4;

    function cancel(state) {
        state.version++;
        clearTimeout(state.timer);
        if (state.controller) state.controller.abort();
    }

    function hide(state) {
        if (state.box.matches(':popover-open')) state.box.hidePopover();
        state.box.hidden = true;
        state.active = -1;
        state.input.setAttribute('aria-expanded', 'false');
        state.input.removeAttribute('aria-activedescendant');
    }

    function place(state) {
        var rect = state.input.getBoundingClientRect();
        var box = state.box;
        box.style.left = Math.max(gap, rect.left) + 'px';
        box.style.width = Math.min(rect.width, innerWidth - gap * 2) + 'px';
        var below = innerHeight - rect.bottom - gap;
        var above = rect.top - gap;
        var up = below < Math.min(box.scrollHeight, 240) && above > below;
        box.style.maxHeight = Math.max(0, Math.min(240, up ? above : below)) + 'px';
        box.style.top = (up ? Math.max(gap, rect.top - box.offsetHeight - gap) : rect.bottom + gap) + 'px';
    }

    function message(state, text) {
        state.box.replaceChildren();
        var item = document.createElement('div');
        item.className = 'text-suggestions-message';
        item.setAttribute('role', 'status');
        item.textContent = text;
        state.box.appendChild(item);
        open(state);
    }

    function open(state) {
        state.box.hidden = false;
        if (state.box.showPopover && !state.box.matches(':popover-open')) state.box.showPopover();
        state.input.setAttribute('aria-expanded', 'true');
        place(state);
    }

    function show(state, values) {
        state.box.replaceChildren();
        state.active = -1;
        values.forEach(function (text, index) {
            var option = document.createElement('div');
            option.id = state.box.id + '-' + index;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', 'false');
            option.textContent = text;
            state.box.appendChild(option);
        });
        state.input.removeAttribute('aria-activedescendant');
        open(state);
    }

    function choose(state, text) {
        state.committed = text;
        cancel(state);
        hide(state);
        state.input.value = text;
        state.input.dispatchEvent(new Event('input', {bubbles: true}));
        state.input.dispatchEvent(new Event('change', {bubbles: true}));
    }

    function lookup(state) {
        cancel(state);
        hide(state);
        var input = state.input;
        var query = input.value.trim();
        if (!query || query.length > (state.options.maxLength || 200) || input.disabled || input.readOnly || input.closest('fieldset:disabled') || state.committed === input.value) return;
        var version = state.version;
        state.timer = setTimeout(function () {
            if (document.activeElement !== input || !input.isConnected) return;
            state.controller = new AbortController();
            message(state, state.options.loadingLabel || 'Поиск…');
            Promise.resolve().then(function () {
                return state.options.load(query, state.controller.signal);
            }).then(function (values) {
                if (state.version !== version || input.value.trim() !== query || !input.isConnected || document.activeElement !== input) return;
                var unique = new Set();
                var useful = values.filter(function (text) {
                    if (typeof text !== 'string' || text === query || unique.has(text.toLocaleLowerCase())) return false;
                    unique.add(text.toLocaleLowerCase());
                    return true;
                });
                if (useful.length) show(state, useful);
                else hide(state);
            }).catch(function () {
                if (state.version === version) hide(state);
            });
        }, state.options.delay == null ? 200 : state.options.delay);
    }

    function attach(input, options) {
        if (inputs.has(input)) return;
        var box = document.createElement('div');
        box.id = 'text-suggestions-' + (++sequence);
        box.className = 'text-suggestions';
        box.setAttribute('role', 'listbox');
        box.setAttribute('aria-label', options.label || 'Ранее сохранённые значения');
        if (box.showPopover) box.setAttribute('popover', 'manual');
        box.hidden = true;
        (input.closest('dialog') || document.body).appendChild(box);
        var attributes = {};
        ['autocomplete', 'aria-autocomplete', 'aria-controls', 'aria-expanded', 'aria-activedescendant'].forEach(function (key) {
            attributes[key] = input.getAttribute(key);
        });
        var state = {input: input, options: options, box: box, attributes: attributes, timer: null, controller: null, version: 0, active: -1, committed: null};
        inputs.set(input, state);
        states.add(state);
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', box.id);
        input.setAttribute('aria-expanded', 'false');
        box.addEventListener('mousedown', function (event) { event.preventDefault(); });
        box.addEventListener('click', function (event) {
            var option = event.target.closest('[role=option]');
            if (option) choose(state, option.textContent);
        });
    }

    function destroy(input) {
        var state = inputs.get(input);
        if (!state) return;
        cancel(state);
        hide(state);
        state.box.remove();
        Object.keys(state.attributes).forEach(function (key) {
            if (state.attributes[key] == null) input.removeAttribute(key);
            else input.setAttribute(key, state.attributes[key]);
        });
        inputs.delete(input);
        states.delete(state);
    }

    document.addEventListener('input', function (event) {
        var state = inputs.get(event.target);
        if (!state) return;
        if (state.committed !== event.target.value) state.committed = null;
        if (!event.isComposing) lookup(state);
    });
    document.addEventListener('compositionstart', function (event) {
        var state = inputs.get(event.target);
        if (state) { cancel(state); hide(state); }
    });
    document.addEventListener('compositionend', function (event) {
        var state = inputs.get(event.target);
        if (state) lookup(state);
    });
    document.addEventListener('focusout', function (event) {
        var state = inputs.get(event.target);
        if (state) { cancel(state); hide(state); }
    });
    document.addEventListener('keydown', function (event) {
        var state = inputs.get(event.target);
        if (!state || event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Escape') cancel(state);
        if (state.box.hidden) return;
        var options = state.box.querySelectorAll('[role=option]');
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
            event.preventDefault();
            if (state.active >= 0) options[state.active].setAttribute('aria-selected', 'false');
            if (state.active < 0) state.active = event.key === 'ArrowDown' ? 0 : options.length - 1;
            else state.active = (state.active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
            var option = options[state.active];
            option.setAttribute('aria-selected', 'true');
            option.scrollIntoView({block: 'nearest'});
            state.input.setAttribute('aria-activedescendant', option.id);
        } else if (event.key === 'Enter' && state.active >= 0) {
            event.preventDefault();
            choose(state, options[state.active].textContent);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            hide(state);
        } else if (event.key === 'Tab') {
            cancel(state);
            hide(state);
        }
    }, true);
    function reposition() {
        states.forEach(function (state) { if (!state.box.hidden) place(state); });
    }
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', reposition);
        window.visualViewport.addEventListener('scroll', reposition);
    }
    document.addEventListener('htmx:beforeCleanupElement', function (event) {
        states.forEach(function (state) {
            if (event.detail.elt === state.input || event.detail.elt.contains(state.input)) destroy(state.input);
        });
    });
    new MutationObserver(function () {
        states.forEach(function (state) { if (!state.input.isConnected) destroy(state.input); });
    }).observe(document.documentElement, {childList: true, subtree: true});
    window.uiKit = window.uiKit || {};
    window.uiKit.textSuggestions = {attach: attach, destroy: destroy, refresh: function (input) { var state = inputs.get(input); if (state) lookup(state); }};
})();
