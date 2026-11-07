const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function factories() {
    const script = readFileSync(path.join(__dirname, '../core/js/photos.js'), 'utf8');
    const registered = {};
    const events = {};
    const context = {Promise, setTimeout, clearTimeout, location: {}, history: {},
        document: {addEventListener(name, fn) { events[name] = fn; }},
        Alpine: {data(name, fn) { registered[name] = fn; }},
        URL: {createObjectURL: () => 'blob:preview', revokeObjectURL() {}},
        compressPhoto: async file => file};
    context.window = context;
    vm.createContext(context);
    vm.runInContext(script, context);
    events['alpine:init']();
    return {registered, context};
}

test('failed upload can retry the same file and releases it after success', async () => {
    const {registered, context} = factories();
    let calls = 0;
    context.uiPhotos.upload = async () => {
        if (++calls === 1) throw new Error('offline');
        return {url: '/photo.jpg', name: 'Фото', deleteUrl: '/photo/delete'};
    };
    const state = registered.photoUploads();
    state.$el = {dataset: {count: '0'}};
    state.target = async () => '/upload';
    state.track = value => value;
    state.init();
    const file = {name: 'photo.jpg', type: 'image/jpeg'};
    state.add([file]);
    await state.queue;
    assert.equal(state.items[0].error, 'offline');
    assert.equal(state.items[0].file, file);
    state.retry(state.items[0]);
    await state.queue;
    assert.equal(calls, 2);
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].url, '/photo.jpg');
    assert.equal(state.items[0].file, null);
    assert.equal(state.count, 1);
});

test('guided photo retries only until saved and announces one completed angle', async () => {
    const {registered, context} = factories();
    let calls = 0;
    context.uiPhotos.upload = async () => {
        if (++calls === 1) throw new Error('offline');
        return {url: '/front.jpg', name: 'Спереди', deleteUrl: '/front/delete'};
    };
    const announced = [];
    const state = registered.photoSlot();
    state.$el = {dataset: {done: 'false', name: 'Спереди'}};
    state.$refs = {input: {value: ''}};
    state.$dispatch = event => announced.push(event);
    state.target = async () => '/upload';
    let pending;
    state.track = value => { pending = value; return value; };
    state.init();
    const file = {name: 'front.jpg', type: 'image/jpeg'};
    state.pick([file]);
    await pending;
    assert.equal(state.file, file);
    assert.equal(state.done, false);
    state.pick([state.file]);
    await pending;
    assert.equal(state.done, true);
    assert.equal(state.file, null);
    assert.deepEqual(announced, ['photo:guided-saved']);
    state.pick([file]);
    assert.equal(calls, 2);
});
