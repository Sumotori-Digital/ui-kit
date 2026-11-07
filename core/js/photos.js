function isPhotoUpload(file) {
    var type = (file.type || '').toLowerCase();
    return /^image\//.test(type) || ((!type || type === 'application/octet-stream') && /\.(heic|heif)$/i.test(file.name));
}
window.uiPhotos = {
    headers: function () { return {}; },
    requestDelete: function (button) {
        button.dispatchEvent(new CustomEvent('photo:delete', {bubbles: true, detail: {url: button.dataset.url}}));
    },
    upload: function (url, file, name) {
        var headers = Object.assign({'Accept': 'application/json'}, window.uiPhotos.headers());
        var body = new FormData();
        body.append('photo', file);
        if (name) body.append('name', name);
        return fetch(url, {method: 'POST', headers: headers, body: body}).catch(function () {
            throw new Error('Нет связи с сервером. Загрузите фото ещё раз');
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                if (!response.ok) throw new Error(data.error || (response.status === 413 ? 'Файл слишком большой' : 'Не удалось загрузить фото'));
                return data;
            });
        });
    }
};
document.addEventListener('alpine:init', function () {
    Alpine.data('photoSlot', function () {
        return {
            root: null, preview: '', busy: false, error: '', over: false, done: false, deleteUrl: '', file: null,
            init: function () {
                this.root = this.$el;
                this.done = this.$el.dataset.done === 'true';
            },
            enter: function () {
                if (this.$refs.input && !this.done) this.over = true;
            },
            pick: function (files) {
                var self = this;
                var file = files && files[0];
                var input = this.$refs.input;
                if (!file || !input || this.busy || this.done) return;
                if (!isPhotoUpload(file)) {
                    this.error = 'Можно загрузить только фотографии';
                    input.value = '';
                    return;
                }
                this.error = '';
                this.file = file;
                this.busy = true;
                this.track(compressPhoto(file)
                    .then(function (photo) {
                        self.show(photo);
                        input.value = '';
                        return self.target().then(function (url) {
                            return window.uiPhotos.upload(url, photo, self.root.dataset.name);
                        }).then(function (saved) {
                            self.root.dataset.viewerItem = 'true';
                            self.root.dataset.url = saved.url;
                            self.root.dataset.title = saved.name;
                            self.deleteUrl = saved.deleteUrl;
                            self.preview = saved.url;
                            self.done = true;
                            self.file = null;
                            self.$dispatch('photo:guided-saved');
                        });
                    })
                    .catch(function (e) {
                        self.preview = '';
                        self.error = e.message;
                        return false;
                    })
                    .finally(function () { self.busy = false; }));
            },
            show: function (photo) {
                if (this.preview.indexOf('blob:') === 0) URL.revokeObjectURL(this.preview);
                this.preview = URL.createObjectURL(photo);
            }
        };
    });
    Alpine.data('photoUploads', function () {
        return {
            count: 0, items: [], seq: 0, queue: Promise.resolve(), over: false, fixedName: '',
            init: function () {
                this.fixedName = this.$el.dataset.name || '';
                this.count = Number(this.$el.dataset.count || 0);
            },
            add: function (files) {
                var self = this;
                Array.from(files).forEach(function (file) {
                    var name = self.fixedName || file.name.replace(/\.[^.]+$/, '') || 'Фото';
                    if (!isPhotoUpload(file)) {
                        self.items.push({key: self.seq++, name: name, preview: '', url: '', deleteUrl: '', busy: false, error: 'Можно загрузить только фотографии'});
                        return;
                    }
                    self.items.push({key: self.seq++, name: name, preview: URL.createObjectURL(file), url: '', deleteUrl: '', busy: false, error: '', file: file});
                    var item = self.items[self.items.length - 1];
                    self.retry(item);
                });
            },
            retry: function (item) {
                if (!item.file || item.busy || item.url) return;
                var self = this;
                item.error = '';
                item.busy = true;
                this.queue = this.queue.then(function () {
                    return compressPhoto(item.file)
                        .then(function (photo) {
                            return self.target().then(function (url) { return window.uiPhotos.upload(url, photo, item.name); });
                        })
                        .then(function (saved) {
                            if (item.preview.indexOf('blob:') === 0) URL.revokeObjectURL(item.preview);
                            item.url = saved.url;
                            item.preview = saved.url;
                            item.name = saved.name;
                            item.deleteUrl = saved.deleteUrl;
                            item.file = null;
                            self.count++;
                        })
                        .catch(function (e) { item.error = e.message; return false; })
                        .finally(function () { item.busy = false; });
                });
                this.track(this.queue);
            },
            dismiss: function (item) {
                if (item.preview.indexOf('blob:') === 0) URL.revokeObjectURL(item.preview);
                item.file = null;
                this.items = this.items.filter(function (other) { return other !== item; });
            }
        };
    });
});
