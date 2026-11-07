(function () {
    var endpoint = new URL(document.currentScript.dataset.endpoint, location.href);
    var forms = new Map();
    var attached = new WeakSet();
    var pending = new WeakMap();

    function fields(path) {
        if (!forms.has(path)) {
            var url = new URL(endpoint);
            url.searchParams.set('path', path);
            forms.set(path, fetch(url, {headers: {'Accept': 'application/json'}}).then(function (response) {
                if (!response.ok) throw new Error('suggestions');
                return response.json();
            }).catch(function () { forms.delete(path); return []; }));
        }
        return forms.get(path);
    }

    function prepare(input) {
        if (!input.matches || !input.matches('input') || !['text', 'tel', 'email', 'url'].includes(input.type) ||
            !input.name || !input.form || input.form.method !== 'post' || input.disabled || input.readOnly ||
            input.autocomplete === 'username' || input.closest('fieldset:disabled') || input.hasAttribute('list') ||
            input.getAttribute('role') === 'combobox' || attached.has(input)) return Promise.resolve();
        if (pending.has(input)) return pending.get(input);
        var action = new URL(input.form.action, location.href);
        if (action.origin !== location.origin) return Promise.resolve();
        var request = fields(action.pathname).then(function (names) {
            if (!input.isConnected || !names.includes(input.name.replace(/\[\d+\]/g, '[]'))) return;
            uiKit.textSuggestions.attach(input, {load: function (query, signal) {
                var url = new URL(endpoint);
                url.searchParams.set('path', action.pathname);
                url.searchParams.set('field', input.name);
                url.searchParams.set('q', query);
                return fetch(url, {signal: signal, headers: {'Accept': 'application/json'}}).then(function (response) {
                    if (!response.ok) throw new Error('suggestions');
                    return response.json();
                });
            }});
            attached.add(input);
        }).finally(function () { pending.delete(input); });
        pending.set(input, request);
        return request;
    }

    document.addEventListener('focusin', function (event) { prepare(event.target); });
    document.addEventListener('input', function (event) {
        var input = event.target;
        if (attached.has(input) || event.isComposing) return;
        prepare(input).then(function () {
            if (attached.has(input) && document.activeElement === input) uiKit.textSuggestions.refresh(input);
        });
    });
})();
