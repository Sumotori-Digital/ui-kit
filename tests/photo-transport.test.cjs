const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/../core/js/photos.js', 'utf8');

function photos(fetch) {
    const context = {
        document: {addEventListener() {}}, fetch,
        FormData: class { constructor() { this.fields = []; } append(name, value) { this.fields.push([name, value]); } },
        CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } }
    };
    context.window = context;
    vm.runInNewContext(source, context);
    return context;
}

test('upload uses the supplied URL, CSRF adapter and multipart fields', async () => {
    let request;
    const api = photos(async (url, options) => {
        request = {url, options};
        return {ok: true, json: async () => ({url: '/saved.jpg'})};
    });
    api.uiPhotos.headers = () => ({'X-CSRF-TOKEN': 'token'});
    const file = {name: 'photo.heic'};
    const saved = await api.uiPhotos.upload('/custom/upload', file, 'Спереди');
    assert.equal(request.url, '/custom/upload');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers['X-CSRF-TOKEN'], 'token');
    assert.deepEqual(request.options.body.fields, [['photo', file], ['name', 'Спереди']]);
    assert.equal(saved.url, '/saved.jpg');
});

test('upload reports server and network errors without retrying POST', async () => {
    let requests = 0;
    const offline = photos(async () => { requests++; throw Error('offline'); });
    await assert.rejects(offline.uiPhotos.upload('/upload', {}), /Нет связи/);
    assert.equal(requests, 1);
    const tooLarge = photos(async () => ({ok: false, status: 413, json: async () => { throw Error('html'); }}));
    await assert.rejects(tooLarge.uiPhotos.upload('/upload', {}), /Файл слишком большой/);
});

test('HEIC with missing Windows MIME type is accepted and other unknown files are rejected', () => {
    const api = photos();
    assert.equal(api.isPhotoUpload({name: 'PHOTO.HEIC', type: ''}), true);
    assert.equal(api.isPhotoUpload({name: 'photo.heif', type: 'application/octet-stream'}), true);
    assert.equal(api.isPhotoUpload({name: 'text.txt', type: 'application/octet-stream'}), false);
});

test('delete emits an event for the application without making a request', () => {
    const api = photos(() => { throw Error('unexpected request'); });
    let emitted;
    api.uiPhotos.requestDelete({dataset: {url: '/custom/delete'}, dispatchEvent(event) { emitted = event; }});
    assert.equal(emitted.type, 'photo:delete');
    assert.equal(emitted.detail.url, '/custom/delete');
    assert.equal(emitted.bubbles, true);
});
