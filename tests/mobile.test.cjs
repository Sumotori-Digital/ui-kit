const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element(text = '') {
    const el = {textContent: text, id: '', attributes: {}, dataset: {}, children: [], listeners: {}, value: '', colSpan: 1,
        style: {setProperty(key, value) { this[key] = value; }},
        classList: {add() {}},
        hasAttribute(key) { return key in this.attributes; },
        getAttribute(key) { return this.attributes[key] ?? null; },
        setAttribute(key, value) { this.attributes[key] = value; },
        toggleAttribute(key, value) { if (value) this.attributes[key] = ''; else delete this.attributes[key]; },
        appendChild(child) { this.children.push(child); },
        insertBefore(child, before) { this.children.splice(this.children.indexOf(before), 0, child); },
        addEventListener(key, handler) { this.listeners[key] = handler; },
        showPopover() {},
        matches() { return false; }};
    return el;
}

function table(labels, values) {
    const headers = labels.map(element);
    const cells = values.map(element);
    const row = {cells};
    const t = {tHead: {rows: [{cells: headers}]}, tBodies: [{rows: [row]}], rows: [{cells: headers}, row], dataset: {}};
    t.parentElement = element();
    t.parentElement.children.push(t);
    return t;
}

function runMobile(records, periods) {
    const handlers = {};
    const root = element();
    const document = {documentElement: root, activeElement: null, createElement: element,
        addEventListener(name, fn) { handlers[name] = fn; },
        querySelectorAll(selector) {
            if (selector.includes('data-mobile="records"')) return records.filter(t => !('mobileReady' in t.dataset));
            if (selector.includes('data-mobile="periods"')) return periods.filter(t => !('mobileReady' in t.dataset));
            return [];
        }};
    const window = {matchMedia: () => ({matches: true, addEventListener() {}}), addEventListener() {}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../core/js/mobile.js'), 'utf8'), {
        document, window, innerHeight: 844, innerWidth: 390, requestAnimationFrame: fn => fn(),
        MutationObserver: class {observe() {}}
    });
    return {handlers, root};
}

test('mobile records keep cell content and associate values with table headers', () => {
    const t = table(['Позиция', 'Количество', 'Действия'], ['Колодки', '2 шт.', 'Изменить']);
    runMobile([t], []);
    assert.equal(t.tBodies[0].rows[0].cells[1].dataset.label, 'Количество');
    assert.equal(t.tBodies[0].rows[0].cells[1].attributes.headers, t.tHead.rows[0].cells[1].id);
    assert.equal(t.tBodies[0].rows[0].cells[2].dataset.mobileActions, '');
    assert.equal(t.tBodies[0].rows[0].cells[0].textContent, 'Колодки');
    assert.equal(t.dataset.mobileReady, '');
});

test('period selector starts with totals and offers each month and the full matrix', () => {
    const t = table(['Статья', 'Октябрь', 'Ноябрь', 'Итого'], ['Расход', '10', '20', '30']);
    runMobile([], [t]);
    const select = t.parentElement.children[0].children[1];
    assert.equal(select.value, '3');
    assert.equal(t.rows[1].cells[2].hasAttribute('data-mobile-hidden'), true);
    assert.equal(t.rows[1].cells[3].hasAttribute('data-mobile-hidden'), false);
    select.value = '2';
    select.listeners.change();
    assert.equal(t.rows[1].cells[1].hasAttribute('data-mobile-hidden'), true);
    assert.equal(t.rows[1].cells[2].hasAttribute('data-mobile-hidden'), false);
    assert.equal(t.rows[1].cells[3].hasAttribute('data-mobile-hidden'), true);
    select.value = 'all';
    select.listeners.change();
    assert.ok(t.rows[1].cells.every(cell => !cell.hasAttribute('data-mobile-hidden')));
});

test('period groups restore their original colspan when all months are shown', () => {
    const t = table(['Статья', 'Октябрь', 'Ноябрь', 'Итого'], ['Расход', '10', '20', '30']);
    const group = element('Расходы');
    group.colSpan = 4;
    t.rows.push({cells: [group]});
    runMobile([], [t]);
    const select = t.parentElement.children[0].children[1];
    assert.equal(group.colSpan, 2);
    select.value = 'all';
    select.listeners.change();
    assert.equal(group.colSpan, 4);
});

test('repeated HTMX setup does not duplicate month controls', () => {
    const t = table(['Статья', 'Октябрь', 'Итого'], ['Расход', '10', '10']);
    const {handlers} = runMobile([], [t]);
    handlers['htmx:afterSwap']();
    handlers['page:swapped']();
    assert.equal(t.parentElement.children.length, 2);
});

test('action menu near the left edge is positioned inside the viewport', () => {
    const handlers = {};
    const content = {style: {}, offsetWidth: 256, offsetHeight: 180};
    const trigger = {getBoundingClientRect: () => ({left: 16, right: 96, top: 100, bottom: 144})};
    const menu = {open: true, matches: () => true, querySelector: s => s === 'summary' ? trigger : content};
    const document = {addEventListener: (type, fn) => { handlers[type] = fn; }, querySelectorAll: () => [menu]};
    vm.runInNewContext(fs.readFileSync(require.resolve('../core/js/actions.js'), 'utf8'), {
        document, window: {addEventListener() {}}, innerWidth: 390, innerHeight: 844
    });
    handlers.toggle({target: menu});
    assert.equal(content.style.left, '8px');
    assert.equal(content.style.position, 'fixed');
    assert.equal(content.style.top, '152px');
});
