const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/../core/js/workspace.js', 'utf8');

function input(name, value) {
    return {name, id: '', type: 'text', value, checked: false, disabled: false, closest() { return null; }};
}

function form(action, elements = []) {
    return {
        method: 'post', action, id: '', elements,
        closest() { return null; }, hasAttribute() { return false; },
        querySelector(selector) { return selector === '.form-actions' ? {} : null; },
        prepend(node) { this.banner = node; }
    };
}

function load({user = 'operator', storageFails = false, result = null, stored = {}, forms = []} = {}) {
    const listeners = {};
    const storage = new Map(Object.entries(stored));
    const location = {pathname: '/items', search: '?q=ABC', hash: '', href: 'https://app.test/items?q=ABC', origin: 'https://app.test'};
    const document = {
        querySelector(selector) {
            if (selector === 'meta[name="ui-user"]') return user ? {content: user} : null;
            if (selector === 'meta[name="ui-save-result"]') return result ? {content: result} : null;
            return null;
        },
        querySelectorAll(selector) { return selector === 'main form' ? forms : []; },
        createElement() { return {setAttribute() {}, appendChild() {}, addEventListener() {}, dataset: {}}; },
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

test('unconfirmed result keeps the submitted draft for a later warning', () => {
    const key = '/items/new#main';
    const app = load({stored: {
        'ui.workspace.operator.pending': JSON.stringify({key, at: Date.now()}),
        'ui.workspace.operator.forms': JSON.stringify({[key]: {at: Date.now(), values: [], submitted: true}})
    }});
    const forms = JSON.parse(app.storage.get('ui.workspace.operator.forms'));
    assert.equal(forms[key].submitted, true);
    assert.equal(app.storage.has('ui.workspace.operator.pending'), false);
});

test('form returned with errors drops its draft without a recovery banner', () => {
    const key = '/items/new#main';
    const returned = form('/items/new');
    const app = load({forms: [returned], stored: {
        'ui.workspace.operator.pending': JSON.stringify({key, at: Date.now()}),
        'ui.workspace.operator.forms': JSON.stringify({[key]: {at: Date.now(), values: [], submitted: true}})
    }});
    const forms = JSON.parse(app.storage.get('ui.workspace.operator.forms'));
    assert.equal(forms[key], undefined);
    assert.equal(returned.banner, undefined);
});

test('later visit to the form after an unconfirmed result shows the warning', () => {
    const key = '/items/new#main';
    const later = form('/items/new');
    load({forms: [later], stored: {
        'ui.workspace.operator.forms': JSON.stringify({[key]: {at: Date.now(), values: [], submitted: true}})
    }});
    assert.ok(later.banner);
});

test('programmatic changes without user input do not create a draft', () => {
    const name = input('name', 'Elf');
    const edited = form('/vehicles/1', [name]);
    edited.elements.forEach(el => { el.form = edited; });
    const app = load({forms: [edited]});
    name.value = 'ELF';
    app.listeners.change({target: name, isTrusted: false});
    app.listeners.pagehide();
    assert.equal(JSON.parse(app.storage.get('ui.workspace.operator.forms') || '{}')['/vehicles/1#main'], undefined);

    name.value = 'Elf 2';
    app.listeners.change({target: name, isTrusted: true});
    assert.equal(JSON.parse(app.storage.get('ui.workspace.operator.forms'))['/vehicles/1#main'].values[0].value, 'Elf 2');
});

test('public pages do not initialize storage or listeners', () => {
    assert.deepEqual(Object.keys(load({user: null}).listeners), []);
});
