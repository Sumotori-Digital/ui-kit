const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/../core/js/navigation.js', 'utf8');

function navigation({confirmed = true} = {}) {
    const listeners = {};
    const windowListeners = {};
    const pushed = [];
    const questions = [];
    let marker = null;
    const emitted = [];
    const requests = [];
    const location = {href: 'https://app.test/items', origin: 'https://app.test', pathname: '/items'};
    const document = {
        querySelector(selector) {
            if (selector === '[data-ui-navigation]') return {dataset: {navigationExclude: '/(files|logout|login|catalog)(/|$)|/export'}};
            if (selector === 'main [data-navigation-dirty]') return marker;
            return null;
        },
        getElementById() { return null; },
        addEventListener(name, fn) { listeners[name] = fn; },
        dispatchEvent(event) { emitted.push(event); }
    };
    vm.runInNewContext(source, {
        document, location, URL, AbortController, TypeError,
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        window: {addEventListener(name, fn) { windowListeners[name] = fn; }}, navigator: {onLine: false},
        history: {pushState(state, title, url) { pushed.push(url); }},
        fetch(url) { requests.push(url); return Promise.reject(new TypeError('offline')); },
        setTimeout() { return 1; }, clearTimeout() {}, confirm(text) { questions.push(text); return confirmed; }
    });
    function click(path) {
        const link = {
            href: 'https://app.test' + path,
            closest() { return null; }, hasAttribute() { return false; }, getAttribute() { return path; }
        };
        let prevented = false;
        listeners.click({target: {closest() { return link; }}, button: 0, preventDefault() { prevented = true; }, stopImmediatePropagation() {}});
        return prevented;
    }
    function type() { listeners.input({target: {form: {method: 'post', closest() { return null; }, matches() { return false; }}}}); }
    function back(path) {
        location.href = 'https://app.test' + path;
        windowListeners.popstate({state: {}});
    }
    function unload() { let prevented = false; windowListeners.beforeunload({preventDefault() { prevented = true; }}); return prevented; }
    function mark() { marker = {}; }
    return {click, emitted, requests, location, listeners, pushed, questions, type, back, unload, mark};
}

test('excluded application routes keep native navigation', () => {
    const app = navigation();
    for (const path of ['/files/one.jpg', '/logout', '/catalog/ja', '/items/export']) assert.equal(app.click(path), false);
    assert.equal(app.requests.length, 0);
});

test('failed GET keeps current page and emits a retry target', async () => {
    const app = navigation();
    assert.equal(app.click('/vehicles'), true);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(app.requests, ['https://app.test/vehicles']);
    assert.equal(app.location.href, 'https://app.test/items');
    assert.equal(app.emitted[0].type, 'workspace:navigation-failed');
    assert.equal(app.emitted[0].detail.url, 'https://app.test/vehicles');
});

test('superseded requests cannot replace the current failure notice', async () => {
    const app = navigation();
    app.click('/vehicles');
    app.click('/repairs');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.emitted.length, 1);
    assert.equal(app.emitted[0].detail.url, 'https://app.test/repairs');
});

test('history navigation asks before dropping unsaved input and restores the address on refusal', () => {
    const app = navigation({confirmed: false});
    app.type();
    app.back('/vehicles');
    assert.equal(app.questions.length, 1);
    assert.deepEqual(app.pushed, ['https://app.test/items']);
    assert.equal(app.requests.length, 0);
});

test('cancelled submit keeps the unsaved state', () => {
    const app = navigation();
    app.type();
    app.listeners.submit({defaultPrevented: true});
    assert.equal(app.unload(), true);
    app.listeners.submit({defaultPrevented: false});
    assert.equal(app.unload(), false);
});

test('marked pending decision protects leaving without typed input', () => {
    const app = navigation({confirmed: false});
    assert.equal(app.unload(), false);
    app.mark();
    assert.equal(app.unload(), true);
    app.click('/vehicles');
    assert.equal(app.questions.length, 1);
    assert.equal(app.requests.length, 0);
});
