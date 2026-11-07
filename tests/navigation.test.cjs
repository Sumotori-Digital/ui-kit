const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/../core/js/navigation.js', 'utf8');

function navigation() {
    const listeners = {};
    const emitted = [];
    const requests = [];
    const location = {href: 'https://app.test/items', origin: 'https://app.test', pathname: '/items'};
    const document = {
        querySelector() { return {dataset: {navigationExclude: '/(files|logout|login|catalog)(/|$)|/export'}}; },
        getElementById() { return null; },
        addEventListener(name, fn) { listeners[name] = fn; },
        dispatchEvent(event) { emitted.push(event); }
    };
    vm.runInNewContext(source, {
        document, location, URL, AbortController, TypeError,
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        window: {addEventListener() {}}, navigator: {onLine: false},
        fetch(url) { requests.push(url); return Promise.reject(new TypeError('offline')); },
        setTimeout() { return 1; }, clearTimeout() {}, confirm() { return true; }
    });
    function click(path) {
        const link = {
            href: 'https://app.test' + path,
            closest() { return null; }, hasAttribute() { return false; }, getAttribute() { return path; }
        };
        let prevented = false;
        listeners.click({target: {closest() { return link; }}, button: 0, preventDefault() { prevented = true; }});
        return prevented;
    }
    return {click, emitted, requests, location};
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
