const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');

function environment() {
    const handlers = {};
    const element = () => ({
        attributes: {}, children: [], style: {}, hidden: true, value: '', isConnected: true, offsetHeight: 40, scrollHeight: 40,
        getAttribute(key) { return this.attributes[key] ?? null; },
        setAttribute(key, value) { this.attributes[key] = value; },
        removeAttribute(key) { delete this.attributes[key]; },
        closest() { return null; },
        matches() { return !!this.open; },
        showPopover() { this.open = true; },
        hidePopover() { this.open = false; },
        appendChild(child) { this.children.push(child); },
        replaceChildren() { this.children = []; },
        addEventListener() {},
        scrollIntoView() {},
        getBoundingClientRect() { return {left: 20, top: 100, bottom: 140, width: 300}; },
        querySelectorAll() { return this.children.filter(child => child.attributes.role === 'option'); },
        remove() { this.removed = true; },
        dispatchEvent(event) { event.target = this; dispatch(event.type, event); }
    });
    const body = element();
    const document = {body, documentElement: {}, createElement: element,
        addEventListener(type, handler) { (handlers[type] ??= []).push(handler); }};
    const window = {addEventListener() {}};
    const dispatch = (type, event) => (handlers[type] || []).forEach(handler => handler(event));
    const context = {window, document, innerWidth: 800, innerHeight: 600, AbortController,
        setTimeout, clearTimeout, Event: class { constructor(type) { this.type = type; } },
        MutationObserver: class { constructor(callback) { window.cleanup = callback; } observe() {} }};
    vm.runInNewContext(readFileSync(require.resolve('../core/js/input-suggestions.js'), 'utf8'), context);
    const input = element();
    document.activeElement = input;
    const key = value => {
        const event = {target: input, key: value, preventDefault() { this.prevented = true; }, stopPropagation() {}};
        dispatch('keydown', event);
        return event;
    };
    return {api: window.uiKit.textSuggestions, input, body, window, dispatch, key};
}

const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('selects the last suggestion with ArrowUp and commits it with Enter', async () => {
    const e = environment();
    e.api.attach(e.input, {delay: 0, load: async () => ['Покраска', 'покраска', 'Покраска кабины']});
    e.input.value = 'по';
    e.api.refresh(e.input);
    await tick();
    const box = e.body.children[0];
    assert.equal(box.querySelectorAll().length, 2);
    e.key('ArrowUp');
    assert.equal(box.children[1].attributes['aria-selected'], 'true');
    e.key('Enter');
    assert.equal(e.input.value, 'Покраска кабины');
    assert.equal(box.hidden, true);
    assert.equal(e.input.attributes['aria-expanded'], 'false');
});

test('Escape aborts a pending request and a late response does not reopen the list', async () => {
    const e = environment();
    let resolve;
    let signal;
    e.api.attach(e.input, {delay: 0, load: (_, value) => { signal = value; return new Promise(done => { resolve = done; }); }});
    e.input.value = 'по';
    e.api.refresh(e.input);
    await tick();
    e.key('Escape');
    assert.equal(signal.aborted, true);
    resolve(['Покраска']);
    await tick();
    assert.equal(e.body.children[0].hidden, true);
});

test('a new query hides stale options immediately and input survives a failed request', async () => {
    const e = environment();
    e.api.attach(e.input, {delay: 0, load: async query => {
        if (query === 'пок') throw new Error('offline');
        return ['Покраска'];
    }});
    e.input.value = 'по';
    e.api.refresh(e.input);
    await tick();
    assert.equal(e.body.children[0].hidden, false);
    e.input.value = 'пок';
    e.api.refresh(e.input);
    assert.equal(e.body.children[0].hidden, true);
    await tick();
    assert.equal(e.input.value, 'пок');
    assert.equal(e.body.children[0].hidden, true);
});

test('removing an input destroys its popup and restores its original attributes', () => {
    const e = environment();
    e.input.setAttribute('autocomplete', 'on');
    e.api.attach(e.input, {load: async () => []});
    e.input.isConnected = false;
    e.window.cleanup();
    assert.equal(e.body.children[0].removed, true);
    assert.equal(e.input.attributes.autocomplete, 'on');
    assert.equal(e.input.getAttribute('aria-controls'), null);
});
