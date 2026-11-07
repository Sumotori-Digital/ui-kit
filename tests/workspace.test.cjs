const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/../core/js/workspace.js', 'utf8');

function load({user = 'operator', storageFails = false, result = null, stored = {}} = {}) {
    const listeners = {};
    const storage = new Map(Object.entries(stored));
    const location = {pathname: '/items', search: '?q=ABC', hash: '', href: 'https://app.test/items?q=ABC', origin: 'https://app.test'};
    const document = {
        querySelector(selector) {
            if (selector === 'meta[name="ui-user"]') return user ? {content: user} : null;
            if (selector === 'meta[name="ui-save-result"]') return result ? {content: result} : null;
            return null;
        },
        querySelectorAll() { return []; },
        addEventListener(name, fn) { listeners[name] = fn; }
    };
    const context = {
        document, location, URL, Date, WeakMap, Set, Event,
        sessionStorage: {
            getItem(key) { if (storageFails) throw Error('denied'); return storage.get(key); },
            setItem(key, value) { if (storageFails) throw Error('denied'); storage.set(key, value); },
            removeItem(key) { if (storageFails) throw Error('denied'); storage.delete(key); }
        },
        window: {addEventListener(name, fn) { listeners[name] = fn; }, scrollTo() {}},
        scrollY: 180, requestAnimationFrame(fn) { fn(); }, setTimeout, clearTimeout
    };
    vm.runInNewContext(source, context);
    return {listeners, storage, location};
}

test('context is stored against outgoing page even after popstate changes location', () => {
    const app = load();
    app.location.pathname = '/vehicles';
    app.listeners['workspace:before-navigation']();
    const pages = JSON.parse(app.storage.get('ui.workspace.operator.pages'));
    assert.equal(pages['/items?q=ABC'].y, 180);
    assert.equal(pages['/vehicles?q=ABC'], undefined);
});

test('logout clears only the current user data and tolerates unavailable storage', () => {
    const app = load({stored: {'ui.workspace.other.forms': '{}', 'ui.workspace.operator.forms': '{}'}});
    app.listeners.submit({defaultPrevented: false, target: {method: 'get', action: '/logout'}});
    assert.equal(app.storage.has('ui.workspace.operator.forms'), false);
    assert.equal(app.storage.has('ui.workspace.other.forms'), true);
    const unavailable = load({storageFails: true});
    assert.doesNotThrow(() => unavailable.listeners.submit({target: {method: 'get', action: '/logout'}}));
});

test('confirmed success clears the submitted draft but retains unrelated drafts', () => {
    const key = '/items/new#main';
    const app = load({result: 'success', stored: {
        'ui.workspace.operator.pending': JSON.stringify({key, at: Date.now()}),
        'ui.workspace.operator.forms': JSON.stringify({[key]: {at: Date.now()}, other: {at: Date.now()}})
    }});
    const forms = JSON.parse(app.storage.get('ui.workspace.operator.forms'));
    assert.equal(forms[key], undefined);
    assert.ok(forms.other);
});

test('public pages do not initialize storage or listeners', () => {
    assert.deepEqual(Object.keys(load({user: null}).listeners), []);
});
