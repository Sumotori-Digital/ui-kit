document.addEventListener('htmx:configRequest', function (e) {
    var token = document.querySelector('meta[name="_csrf"]');
    var header = document.querySelector('meta[name="_csrf_header"]');
    if (token && header && header.content) e.detail.headers[header.content] = token.content;
    var sorting = e.detail.elt;
    if (sorting && sorting.matches && sorting.matches('select[data-sort-select]')) {
        var choice = sorting.value.split(':');
        delete e.detail.parameters[sorting.name];
        e.detail.parameters.sort = choice[0];
        e.detail.parameters.dir = choice[1];
    }
});
document.addEventListener('toast', function (e) {
    var toaster = document.getElementById('toaster');
    if (toaster && toaster.toast) toaster.toast(e.detail);
});
document.addEventListener('htmx:responseError', function () {
    var toaster = document.getElementById('toaster');
    if (toaster && toaster.toast) toaster.toast({category: 'error', title: 'Ошибка', description: 'Не удалось выполнить запрос'});
});
function connectionLost(e) {
    var toaster = document.getElementById('toaster');
    if (!toaster || !toaster.toast) return;
    var reading = !e.detail.requestConfig || e.detail.requestConfig.verb === 'get';
    toaster.toast(reading
        ? {category: 'error', title: 'Нет связи с сервером', description: 'Данные не обновились. Повторите действие позже'}
        : {category: 'error', title: 'Нет связи с сервером', description: 'Неизвестно, сохранилось ли изменение. Обновите страницу и проверьте запись перед повтором'});
}
document.addEventListener('htmx:sendError', connectionLost);
document.addEventListener('htmx:timeout', connectionLost);
(function () {
    var meta = document.querySelector('meta[name="session-timeout"]');
    if (!meta) return;
    var timeout = Number(meta.content) * 1000;
    var key = 'ss:last-activity';
    var timer;
    function schedule(delay) {
        clearTimeout(timer);
        timer = setTimeout(check, delay + 1000);
    }
    function touch() {
        localStorage.setItem(key, String(Date.now()));
        schedule(timeout);
    }
    function check() {
        var idle = Date.now() - Number(localStorage.getItem(key) || 0);
        if (idle < timeout) return schedule(timeout - idle);
        location.assign(location.pathname + location.search);
    }
    touch();
    document.addEventListener('htmx:afterRequest', touch);
})();
function markSortedColumns() {
    document.querySelectorAll('.sort-link').forEach(function (link) {
        var cell = link.closest('th');
        if (!cell) return;
        if (link.dataset.sortDir) cell.setAttribute('aria-sort', link.dataset.sortDir === 'desc' ? 'descending' : 'ascending');
        else cell.removeAttribute('aria-sort');
    });
}
document.addEventListener('DOMContentLoaded', markSortedColumns);
document.addEventListener('htmx:afterSettle', markSortedColumns);
document.addEventListener('page:swapped', markSortedColumns);
var searchFocus = null;
document.addEventListener('htmx:beforeSwap', function (e) {
    var input = document.activeElement;
    if (!input || !input.matches('input[type="search"][hx-preserve]') || !e.detail.target.contains(input)) return;
    searchFocus = {
        id: input.id,
        start: input.selectionStart,
        end: input.selectionEnd,
        direction: input.selectionDirection
    };
});
document.addEventListener('htmx:afterSettle', function () {
    if (!searchFocus) return;
    var state = searchFocus;
    searchFocus = null;
    var input = document.getElementById(state.id);
    if (!input) return;
    input.focus({preventScroll: true});
    if (state.start !== null && state.end !== null) {
        input.setSelectionRange(state.start, state.end, state.direction || 'none');
    }
});
window.compressPhoto = function (file) {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || !window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file, {imageOrientation: 'from-image'})
        .then(function (bitmap) {
            var scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(bitmap.width * scale);
            canvas.height = Math.round(bitmap.height * scale);
            var context = canvas.getContext('2d');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();
            return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.85); });
        })
        .then(function (blob) {
            if (!blob || blob.size >= file.size) return file;
            return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {type: 'image/jpeg', lastModified: file.lastModified});
        })
        .catch(function () { return file; });
};
document.addEventListener('alpine:init', function () {
    Alpine.data('monthPicker', function () {
        return {
            open: false,
            view: 'months',
            year: new Date().getFullYear(),
            yearsFrom: 0,
            value: '',
            init: function () {
                this.value = this.$refs.input.value;
            },
            parsed: function () {
                var m = /^(\d{2})\.(\d{4})$/.exec(this.value);
                return m ? {month: +m[1], year: +m[2]} : null;
            },
            format: function () {
                var digits = this.$refs.input.value.replace(/\D/g, '').slice(0, 6);
                this.$refs.input.value = digits.length > 2 ? digits.slice(0, 2) + '.' + digits.slice(2) : digits;
                this.value = this.$refs.input.value;
            },
            toggle: function () {
                if (!this.open) {
                    var current = this.parsed();
                    this.year = current ? current.year : new Date().getFullYear();
                    this.view = 'months';
                }
                this.open = !this.open;
            },
            shift: function (delta) {
                if (this.view === 'years') this.yearsFrom += delta * 12;
                else this.year += delta;
            },
            zoom: function () {
                this.yearsFrom = Math.floor(this.year / 12) * 12;
                this.view = 'years';
            },
            title: function () {
                if (this.view === 'months') return String(this.year);
                var years = this.years();
                return years[0] + ' – ' + years[years.length - 1];
            },
            years: function () {
                var start = this.yearsFrom;
                return Array.from({length: 12}, function (_, i) { return start + i; });
            },
            pickYear: function (year) {
                this.year = year;
                this.view = 'months';
            },
            selected: function (month) {
                var current = this.parsed();
                return !!current && current.year === this.year && current.month === month;
            },
            pick: function (month) {
                this.value = String(month).padStart(2, '0') + '.' + this.year;
                this.$refs.input.value = this.value;
                this.$refs.input.dispatchEvent(new Event('change', {bubbles: true}));
                this.open = false;
                this.$refs.input.focus();
            }
        };
    });
    Alpine.data('phoneMask', function () {
        var groups = function (digits) {
            if (digits.charAt(0) === '7') return [1, 3, 3, 2, 2];
            if (digits.slice(0, 2) === '81') {
                var national = digits.slice(2);
                if (/^[5789]0/.test(national)) return [2, 2, 4, 4];
                if (/^[36]/.test(national)) return [2, 1, 4, 4];
                return [2, 2, 3, 4];
            }
            return [3, 3, 3, 3, 3];
        };
        var format = function (value) {
            var digits = value.replace(/\D/g, '');
            if (!digits) return value.trim().charAt(0) === '+' ? '+' : '';
            if (value.trim().charAt(0) !== '+' && digits.charAt(0) === '0') digits = '81' + digits.slice(1);
            digits = digits.slice(0, 15);
            var parts = [];
            var at = 0;
            groups(digits).forEach(function (size) {
                if (at < digits.length) parts.push(digits.slice(at, at += size));
            });
            if (at < digits.length) parts[parts.length - 1] += digits.slice(at);
            return '+' + parts.join(' ');
        };
        return {
            init: function () {
                if (this.$el.value) this.$el.value = format(this.$el.value);
            },
            reformat: function () {
                var el = this.$el;
                var before = el.value.slice(0, el.selectionEnd).replace(/\D/g, '').length;
                if (before > 0 && el.value.trim().charAt(0) !== '+' && el.value.replace(/\D/g, '').charAt(0) === '0') before++;
                el.value = format(el.value);
                if (document.activeElement !== el) return;
                var at = 0;
                for (var seen = 0; at < el.value.length && seen < before; at++) {
                    if (/\d/.test(el.value.charAt(at))) seen++;
                }
                el.setSelectionRange(at, at);
            }
        };
    });
    Alpine.data('datePicker', function () {
        var months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return {
            open: false,
            view: 'days',
            year: 0,
            yearsFrom: 0,
            month: 0,
            value: '',
            init: function () {
                var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.$refs.value.value);
                if (m) this.$refs.input.value = m[3] + '.' + m[2] + '.' + m[1];
                this.sync();
            },
            parsed: function () {
                var m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(this.$refs.input.value);
                if (!m) return null;
                var date = new Date(+m[3], +m[2] - 1, +m[1]);
                if (date.getFullYear() !== +m[3] || date.getMonth() !== +m[2] - 1 || date.getDate() !== +m[1]) return null;
                return {day: +m[1], month: +m[2], year: +m[3]};
            },
            sync: function () {
                var input = this.$refs.input;
                var current = this.parsed();
                this.value = current ? current.year + '-' + pad(current.month) + '-' + pad(current.day) : '';
                this.$refs.value.value = this.value;
                input.setCustomValidity(input.value && !current ? 'Введите дату в формате ДД.ММ.ГГГГ' : '');
            },
            format: function () {
                var digits = this.$refs.input.value.replace(/\D/g, '').slice(0, 8);
                var parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean);
                this.$refs.input.value = parts.join('.');
                this.sync();
            },
            toggle: function () {
                if (!this.open) {
                    var current = this.parsed();
                    var today = new Date();
                    this.year = current ? current.year : today.getFullYear();
                    this.month = current ? current.month : today.getMonth() + 1;
                    this.view = 'days';
                }
                this.open = !this.open;
            },
            shift: function (delta) {
                if (this.view === 'years') {
                    this.yearsFrom += delta * 12;
                    return;
                }
                if (this.view === 'months') {
                    this.year += delta;
                    return;
                }
                var date = new Date(this.year, this.month - 1 + delta, 1);
                this.year = date.getFullYear();
                this.month = date.getMonth() + 1;
            },
            zoom: function () {
                if (this.view === 'months') this.yearsFrom = Math.floor(this.year / 12) * 12;
                this.view = this.view === 'days' ? 'months' : 'years';
            },
            title: function () {
                if (this.view === 'years') {
                    var years = this.years();
                    return years[0] + ' – ' + years[years.length - 1];
                }
                return this.view === 'months' ? String(this.year) : months[this.month - 1] + ' ' + this.year;
            },
            years: function () {
                var start = this.yearsFrom;
                return Array.from({length: 12}, function (_, i) { return start + i; });
            },
            pickYear: function (year) {
                this.year = year;
                this.view = 'months';
            },
            pickMonth: function (month) {
                this.month = month;
                this.view = 'days';
            },
            cells: function () {
                var offset = (new Date(this.year, this.month - 1, 1).getDay() + 6) % 7;
                var days = new Date(this.year, this.month, 0).getDate();
                var current = this.parsed();
                var today = new Date();
                var cells = [];
                for (var i = 0; i < offset; i++) cells.push({key: 'e' + i, day: null});
                for (var d = 1; d <= days; d++) {
                    cells.push({
                        key: this.year + '-' + this.month + '-' + d,
                        day: d,
                        selected: !!current && current.year === this.year && current.month === this.month && current.day === d,
                        today: today.getFullYear() === this.year && today.getMonth() + 1 === this.month && today.getDate() === d
                    });
                }
                return cells;
            },
            pick: function (day) {
                this.$refs.input.value = pad(day) + '.' + pad(this.month) + '.' + this.year;
                this.sync();
                this.$refs.input.dispatchEvent(new Event('change', {bubbles: true}));
                this.open = false;
                this.$refs.input.focus();
            }
        };
    });
    Alpine.data('quickCreate', function () {
        return {
            opened: false,
            name: '',
            busy: false,
            error: '',
            root: null,
            url: '',
            init: function () {
                var self = this;
                this.root = this.$el.closest('.combobox');
                this.url = this.$el.dataset.url;
                window.addEventListener('quick-created', function (e) {
                    if (e.detail.url === self.url && e.detail.source !== self.root) self.append(e.detail);
                });
            },
            show: function () {
                var self = this;
                this.opened = true;
                this.error = '';
                this.$nextTick(function () { self.$refs.name.focus(); });
            },
            hide: function () {
                if (this.busy) return;
                this.opened = false;
                this.name = '';
                this.error = '';
            },
            append: function (item) {
                var existing = Array.from(this.root.querySelectorAll('[role="option"][data-value]')).find(function (option) {
                    return option.dataset.value === String(item.id);
                });
                if (existing) return;
                var option = document.createElement('div');
                option.setAttribute('role', 'option');
                option.dataset.value = item.id;
                option.textContent = item.name;
                this.root.querySelector('[role="listbox"]').appendChild(option);
                this.root.refresh();
            },
            add: function (type) {
                var name = this.name.trim();
                if (!name || this.busy) return;
                var self = this;
                var url = this.url;
                var token = document.querySelector('meta[name="_csrf"]');
                var header = document.querySelector('meta[name="_csrf_header"]');
                var headers = {'Accept': 'application/json'};
                if (token && header && header.content) headers[header.content] = token.content;
                var body = new URLSearchParams({name: name});
                if (type) body.set('type', type);
                this.busy = true;
                this.error = '';
                fetch(url, {method: 'POST', headers: headers, body: body})
                    .then(function (r) {
                        return r.json().then(function (data) { return {ok: r.ok, data: data}; });
                    })
                    .then(function (res) {
                        if (!res.ok) {
                            self.error = res.data.error || 'Не удалось добавить';
                            return;
                        }
                        if (!res.data || !res.data.id || !res.data.name) {
                            self.error = 'Сервер вернул некорректный ответ';
                            return;
                        }
                        self.append(res.data);
                        self.root.select(String(res.data.id));
                        self.opened = false;
                        self.name = '';
                        window.dispatchEvent(new CustomEvent('quick-created', {
                            detail: {url: url, id: res.data.id, name: res.data.name, source: self.root}
                        }));
                    })
                    .catch(function () { self.error = 'Не удалось добавить'; })
                    .finally(function () { self.busy = false; });
            }
        };
    });
    Alpine.data('multiSelect', function () {
        return {
            placeholder: 'Все', picked: [], query: '', creating: false, name: '', busy: false, error: '', url: '', root: null,
            init: function () {
                this.root = this.$el;
                this.placeholder = this.$el.dataset.placeholder || 'Все';
                this.url = this.$el.dataset.create || '';
                this.sync();
            },
            sync: function () {
                var root = this.root;
                this.picked = Array.from(root.querySelectorAll('input[data-selected-id]')).map(function (input) {
                    var option = Array.from(root.querySelectorAll('[role="option"][data-id]')).find(function (item) {
                        return item.dataset.id === input.value;
                    });
                    return {id: input.value, name: option ? option.dataset.name : input.value};
                });
                if (!this.picked.length) {
                    this.picked = Array.from(root.querySelectorAll('input[type=checkbox]:checked')).map(function (input) {
                        return {id: input.value, name: input.parentElement.querySelector('span').textContent.trim()};
                    });
                }
                root.querySelectorAll('[role="option"][data-id]').forEach(function (option) {
                    option.dataset.selected = String(Array.from(root.querySelectorAll('input[data-selected-id]')).some(function (input) {
                        return input.value === option.dataset.id;
                    }));
                });
            },
            toggle: function (id, name) {
                var existing = Array.from(this.root.querySelectorAll('input[data-selected-id]')).find(function (input) {
                    return input.value === String(id);
                });
                if (existing) existing.remove(); else this.select(id, name);
                this.sync();
            },
            select: function (id, name) {
                if (Array.from(this.root.querySelectorAll('input[data-selected-id]')).some(function (input) { return input.value === String(id); })) return;
                var input = document.createElement('input');
                input.type = 'hidden'; input.name = this.root.dataset.name; input.value = id; input.dataset.selectedId = id;
                this.root.appendChild(input);
            },
            remove: function (id) {
                var input = Array.from(this.root.querySelectorAll('input[data-selected-id]')).find(function (item) {
                    return item.value === String(id);
                });
                if (input) input.remove();
                this.sync();
            },
            showCreate: function () {
                var self = this;
                this.creating = true;
                this.error = '';
                this.$nextTick(function () { self.$refs.createName.focus(); });
            },
            hideCreate: function () {
                if (this.busy) return;
                this.creating = false;
                this.name = '';
                this.error = '';
            },
            add: function () {
                var self = this;
                var value = this.name.trim();
                if (!value || !this.url || this.busy) return;
                var token = document.querySelector('meta[name="_csrf"]');
                var header = document.querySelector('meta[name="_csrf_header"]');
                var headers = {'Accept': 'application/json'};
                if (token && header && header.content) headers[header.content] = token.content;
                this.busy = true;
                this.error = '';
                fetch(this.url, {method: 'POST', headers: headers, body: new URLSearchParams({name: value})})
                    .then(function (response) { return response.json().then(function (data) { return {ok: response.ok, data: data}; }); })
                    .then(function (result) {
                        if (!result.ok) { self.error = result.data.error || 'Не удалось добавить'; return; }
                        var existing = Array.from(self.root.querySelectorAll('[role="option"][data-id]')).some(function (item) {
                            return item.dataset.id === String(result.data.id);
                        });
                        if (existing) {
                            self.select(result.data.id, result.data.name);
                            self.creating = false; self.name = ''; self.sync();
                            return;
                        }
                        var option = document.createElement('button');
                        var text = document.createElement('span');
                        option.type = 'button'; option.setAttribute('role', 'option'); option.dataset.id = result.data.id; option.dataset.name = result.data.name;
                        option.addEventListener('click', function () { self.toggle(option.dataset.id, option.dataset.name); });
                        text.textContent = result.data.name; option.appendChild(text);
                        var check = self.root.querySelector('template[data-check]');
                        if (check) option.appendChild(check.content.cloneNode(true));
                        self.root.querySelector('[data-popover]').insertBefore(option, self.root.querySelector('[x-ref="quickArea"]'));
                        self.select(result.data.id, result.data.name);
                        self.creating = false; self.name = ''; self.sync();
                    })
                    .catch(function () { self.error = 'Не удалось добавить'; })
                    .finally(function () { self.busy = false; });
            }
        };
    });
    Alpine.data('stickyToolbar', function () {
        return {
            init: function () {
                var el = this.$el;
                var sentinel = document.createElement('div');
                sentinel.className = 'list-toolbar-sentinel';
                el.before(sentinel);
                new IntersectionObserver(function (entries) {
                    el.toggleAttribute('data-stuck', !entries[0].isIntersecting);
                }, {threshold: 1}).observe(sentinel);
            }
        };
    });
    Alpine.data('exportColumns', function () {
        return {
            count: 0,
            defaults: [],
            init: function () {
                this.dialog = this.$el;
                this.key = 'export:' + this.dialog.dataset.url;
                this.defaults = this.checked();
                var saved = null;
                try { saved = JSON.parse(localStorage.getItem(this.key)); } catch (e) {}
                if (Array.isArray(saved) && saved.length) this.apply(saved);
                this.count = this.checked().length;
            },
            boxes: function () {
                return Array.prototype.slice.call(this.dialog.querySelectorAll('input[name=cols]'));
            },
            checked: function () {
                return this.boxes().filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
            },
            apply: function (keys) {
                this.boxes().forEach(function (b) { b.checked = keys.indexOf(b.value) >= 0; });
                this.count = this.checked().length;
            },
            all: function () {
                this.apply(this.boxes().map(function (b) { return b.value; }));
            },
            reset: function () {
                this.apply(this.defaults);
            },
            download: function () {
                var cols = this.checked();
                localStorage.setItem(this.key, JSON.stringify(cols));
                var params = new URLSearchParams(location.search);
                params.delete('page');
                params.delete('cols');
                cols.forEach(function (c) { params.append('cols', c); });
                location.href = this.dialog.dataset.url + '?' + params;
                this.dialog.close();
            }
        };
    });
});
function qrCodeList(codes) {
    return {
        codes: codes || [],
        draft: '',
        add: function () {
            var code = this.draft.trim();
            if (code && !this.codes.includes(code)) this.codes.push(code);
            this.draft = '';
        },
        remove: function (code) {
            this.codes = this.codes.filter(function (item) { return item !== code; });
        }
    };
}
document.addEventListener(
    "toggle",
    (e) => {
        const menu = e.target;
        if (!menu.classList.contains("quick-actions-menu")) return;
        const trigger = document.querySelector(
            '[popovertarget="' + menu.id + '"]',
        );
        if (!trigger) return;
        const open = e.newState === "open";
        trigger.setAttribute("aria-expanded", String(open));
        if (!open) return;
        const r = trigger.getBoundingClientRect();
        const w = menu.offsetWidth;
        const h = menu.offsetHeight;
        const gap = 6;
        let left = Math.min(
            Math.max(8, r.right - w),
            window.innerWidth - w - 8,
        );
        let top = r.bottom + gap;
        if (top + h > window.innerHeight - 8 && r.top - h - gap > 8) {
            top = r.top - h - gap;
        }
        menu.style.left = left + "px";
        menu.style.top = top + "px";
    },
    true,
);
(function () {
    function setupScanner(dialog) {
        const video = dialog.querySelector("video");
        const status = dialog.querySelector("[data-status]");
        const title = dialog.querySelector("[data-title]");
        const barcodeFormats = [
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "code_128",
            "code_39",
            "code_93",
            "itf",
            "codabar",
        ];
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", {
            willReadFrequently: true,
        });
        let stream = null;
        let target = null;
        let frame = null;
        let barcode = false;
        let fallback = null;
        let barcodeFallback = null;

        function loadScript(src, result) {
            return new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = src;
                script.onload = () => resolve(result());
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        function loadFallback() {
            fallback ??= loadScript(
                dialog.dataset.fallback,
                () => window.jsQR,
            );
            return fallback;
        }

        function loadBarcodeFallback() {
            barcodeFallback ??= loadScript(
                dialog.dataset.barcodeFallback,
                () => window.ZXing,
            );
            return barcodeFallback;
        }

        async function nativeDecoder(wanted) {
            if (!("BarcodeDetector" in window)) return null;
            try {
                const supported =
                    await BarcodeDetector.getSupportedFormats();
                const formats = wanted.filter((f) =>
                    supported.includes(f),
                );
                if (!formats.length) return null;
                const detector = new BarcodeDetector({ formats });
                return async () => {
                    const codes = await detector.detect(video);
                    return codes.length ? codes[0].rawValue : null;
                };
            } catch (error) {
                return null;
            }
        }

        async function barcodeDecoder() {
            const native = await nativeDecoder(barcodeFormats);
            if (native) return native;
            const ZXing = await loadBarcodeFallback();
            const hints = new Map();
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
                ZXing.BarcodeFormat.EAN_13,
                ZXing.BarcodeFormat.EAN_8,
                ZXing.BarcodeFormat.UPC_A,
                ZXing.BarcodeFormat.UPC_E,
                ZXing.BarcodeFormat.CODE_128,
                ZXing.BarcodeFormat.CODE_39,
                ZXing.BarcodeFormat.CODE_93,
                ZXing.BarcodeFormat.ITF,
                ZXing.BarcodeFormat.CODABAR,
            ]);
            hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
            const reader = new ZXing.MultiFormatReader();
            reader.setHints(hints);
            return async () => {
                const width = video.videoWidth;
                const height = video.videoHeight;
                if (!width) return null;
                const scale = Math.min(1, 1280 / width);
                canvas.width = Math.round(width * scale);
                canvas.height = Math.round(height * scale);
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                try {
                    const source =
                        new ZXing.HTMLCanvasElementLuminanceSource(canvas);
                    const bitmap = new ZXing.BinaryBitmap(
                        new ZXing.HybridBinarizer(source),
                    );
                    return reader.decode(bitmap).getText();
                } catch (error) {
                    return null;
                }
            };
        }

        async function decoder() {
            if (barcode) return barcodeDecoder();
            const native = await nativeDecoder(["qr_code"]);
            if (native) return native;
            const decode = await loadFallback();
            let center = true;
            return async () => {
                const width = video.videoWidth;
                const height = video.videoHeight;
                if (!width) return null;
                const side = Math.min(width, height);
                const crop = center ? side * 0.6 : side;
                center = !center;
                const size = Math.round(Math.min(crop, 800));
                canvas.width = size;
                canvas.height = size;
                context.drawImage(
                    video,
                    (width - crop) / 2,
                    (height - crop) / 2,
                    crop,
                    crop,
                    0,
                    0,
                    size,
                    size,
                );
                const result = decode(
                    context.getImageData(0, 0, size, size).data,
                    size,
                    size,
                    { inversionAttempts: "attemptBoth" },
                );
                return result ? result.data : null;
            };
        }

        async function open(input, format) {
            target = input;
            barcode = format === "barcode";
            title.textContent = barcode
                ? "Сканирование штрихкода"
                : "Сканирование QR-кода";
            status.textContent = barcode
                ? "Поместите штрихкод в рамку горизонтально"
                : "Поместите QR-код в рамку";
            dialog.showModal();
            if (!navigator.mediaDevices?.getUserMedia) {
                status.textContent =
                    "Камера недоступна в этом браузере";
                return;
            }
            let media;
            try {
                media = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false,
                });
            } catch (error) {
                status.textContent =
                    error.name === "NotAllowedError"
                        ? "Нет доступа к камере. Разрешите его в настройках браузера"
                        : "Не удалось включить камеру";
                return;
            }
            if (!dialog.open) {
                media.getTracks().forEach((t) => t.stop());
                return;
            }
            stream = media;
            const [track] = stream.getVideoTracks();
            const focus = track.getCapabilities?.().focusMode;
            if (focus?.includes("continuous")) {
                track
                    .applyConstraints({
                        advanced: [{ focusMode: "continuous" }],
                    })
                    .catch(() => {});
            }
            video.srcObject = stream;
            await video.play();
            const detect = await decoder();
            const tick = async () => {
                if (!stream) return;
                let code = null;
                try {
                    code = await detect();
                } catch (error) {}
                if (code) {
                    done(code.trim());
                    return;
                }
                frame = requestAnimationFrame(tick);
            };
            tick();
        }

        function stop() {
            cancelAnimationFrame(frame);
            stream?.getTracks().forEach((t) => t.stop());
            stream = null;
            video.srcObject = null;
        }

        function done(code) {
            const input = target;
            dialog.close();
            input.value = code;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.focus();
            input.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                }),
            );
            if (input.hasAttribute("data-scan-submit")) {
                input.form.requestSubmit();
            }
        }

        dialog.addEventListener("close", stop);
        return open;
    }
    document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-scan-camera]");
        if (!button) return;
        const dialog = document.getElementById("qr-scanner");
        const input = document.getElementById(button.dataset.scanCamera);
        if (!dialog || !input) return;
        dialog.scan = dialog.scan || setupScanner(dialog);
        dialog.scan(input, button.dataset.scanFormat);
    });
})();
(function () {
    function setupViewer(dialog) {
        const img = dialog.querySelector("img");
        const frame = dialog.querySelector("iframe");
        const counter = dialog.querySelector("[data-counter]");
        const prev = dialog.querySelector("[data-prev]");
        const next = dialog.querySelector("[data-next]");
        let items = [];
        let index = 0;

        function show(i) {
            index = (i + items.length) % items.length;
            const { url, title, image } = items[index].dataset;
            const isImage = image !== "false";
            dialog.querySelector("h2").textContent = title || "";
            img.hidden = !isImage;
            frame.hidden = isImage;
            img.src = isImage ? url : "";
            frame.src = isImage ? "" : url;
            dialog.querySelector("a[target]").href = url;
            counter.hidden = items.length < 2;
            counter.textContent = index + 1 + " из " + items.length;
            prev.hidden = next.hidden = items.length < 2;
        }

        prev.addEventListener("click", () => show(index - 1));
        next.addEventListener("click", () => show(index + 1));
        dialog.addEventListener("keydown", (e) => {
            if (items.length < 2) return;
            if (e.key === "ArrowLeft") show(index - 1);
            if (e.key === "ArrowRight") show(index + 1);
        });
        dialog.addEventListener("close", () => {
            img.src = "";
            frame.src = "";
        });
        return (el) => {
            const item = el.closest("[data-viewer-item]");
            if (!item) return;
            const group =
                item.closest("[data-viewer-group]") ||
                item.parentElement;
            items = [
                ...group.querySelectorAll("[data-viewer-item]"),
            ];
            show(items.indexOf(item));
            dialog.showModal();
            dialog.querySelector("footer button").focus();
        };
    }
    window.openViewer = (el) => {
        const dialog = document.getElementById("file-viewer");
        if (!dialog) return;
        dialog.view = dialog.view || setupViewer(dialog);
        dialog.view(el);
    };
})();
function scanPick(missing) {
    return {
        code: '',
        pick: function () {
            var code = this.code.trim();
            var target = this.$refs.target;
            var option = Array.prototype.find.call(target.querySelectorAll('[role=option]'), function (o) { return o.dataset.code === code; });
            if (option) {
                target.querySelector('.combobox').value = option.dataset.value;
                this.code = '';
                if (this.picked) this.picked();
                return;
            }
            document.getElementById('toaster').toast({category: 'error', title: (missing || 'Код {code} не найден').replace('{code}', code)});
        }
    };
}
(function () {
    var gap = 8;
    function visibleArea(popover) {
        var left = 0;
        var right = document.documentElement.clientWidth;
        for (var el = popover.parentElement; el && el !== document.body; el = el.parentElement) {
            var style = getComputedStyle(el);
            if (style.overflowX !== 'visible') {
                var rect = el.getBoundingClientRect();
                left = Math.max(left, rect.left);
                right = Math.min(right, rect.right);
            }
            if (style.position === 'fixed') break;
        }
        return {left: left + gap, right: right - gap};
    }
    function place(popover) {
        popover.style.left = '';
        popover.style.right = '';
        if ('flipped' in popover.dataset) {
            delete popover.dataset.side;
            delete popover.dataset.flipped;
        }
        if (popover.getAttribute('aria-hidden') === 'true' || !popover.offsetParent) return;
        var anchor = popover.offsetParent.getBoundingClientRect();
        var height = popover.offsetHeight;
        if (
            !popover.dataset.side &&
            anchor.bottom + height + gap > window.innerHeight &&
            anchor.top - height - gap >= 0
        ) {
            popover.dataset.side = 'top';
            popover.dataset.flipped = '';
        }
        var width = popover.offsetWidth;
        var centered = popover.dataset.align === 'center';
        var left = anchor.left + popover.offsetLeft - (centered ? width / 2 : 0);
        var area = visibleArea(popover);
        var shift = 0;
        if (left + width > area.right) shift = area.right - left - width;
        if (left + shift < area.left) shift = area.left - left;
        if (!shift) return;
        popover.style.left = popover.offsetLeft + shift + 'px';
        popover.style.right = 'auto';
    }
    new MutationObserver(function (records) {
        records.forEach(function (record) {
            if (record.target.matches('[data-popover]')) place(record.target);
        });
    }).observe(document.documentElement, {attributes: true, attributeFilter: ['aria-hidden'], subtree: true});
})();
(function () {
    var duration = 240;
    var easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
    var selector = '.tabs > [role="tablist"]';
    var carried = null;
    function selectedTab(list) {
        return list.querySelector(':scope > [role="tab"][aria-selected="true"]');
    }
    function frameOf(tab) {
        return {x: tab.offsetLeft, y: tab.offsetTop, width: tab.offsetWidth, height: tab.offsetHeight};
    }
    function keyframe(frame) {
        return {transform: 'translate(' + frame.x + 'px, ' + frame.y + 'px)', width: frame.width + 'px', height: frame.height + 'px'};
    }
    function slide(indicator, from, to, elapsed) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        indicator.animate([keyframe(from), keyframe(to)], {duration: duration, easing: easing, delay: -elapsed});
    }
    function place(list, animate) {
        var indicator = list.querySelector(':scope > .tab-indicator');
        var tab = selectedTab(list);
        indicator.hidden = !tab || !tab.offsetWidth;
        if (indicator.hidden) return;
        var frame = frameOf(tab);
        var previous = list.tabFrame;
        list.tabFrame = frame;
        Object.assign(indicator.style, keyframe(frame));
        if (animate && previous) slide(indicator, previous, frame, 0);
    }
    function indexOf(list) {
        return Array.prototype.indexOf.call(document.querySelectorAll(selector), list);
    }
    function resume(list) {
        var trip = carried;
        carried = null;
        if (!trip || trip.index !== indexOf(list) || trip.count !== list.querySelectorAll(':scope > [role="tab"]').length) return;
        var elapsed = performance.now() - trip.at;
        if (elapsed < duration && list.tabFrame) slide(list.querySelector(':scope > .tab-indicator'), trip.from, list.tabFrame, elapsed);
    }
    function setup(list) {
        if (list.querySelector(':scope > .tab-indicator')) return;
        var indicator = document.createElement('span');
        indicator.className = 'tab-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        list.appendChild(indicator);
        place(list, false);
        new MutationObserver(function () {
            place(list, true);
        }).observe(list, {attributes: true, attributeFilter: ['aria-selected'], subtree: true});
        new ResizeObserver(function () {
            place(list, false);
        }).observe(list);
    }
    function setupAll() {
        document.querySelectorAll(selector).forEach(setup);
        var first = carried && document.querySelectorAll(selector)[carried.index];
        if (first) resume(first);
    }
    document.addEventListener('click', function (event) {
        var tab = event.target.closest && event.target.closest('a[role="tab"]');
        if (!tab || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (tab.getAttribute('aria-selected') === 'true' || tab.getAttribute('aria-disabled') === 'true') return;
        var list = tab.closest(selector);
        if (!list || !list.tabFrame) return;
        carried = {
            index: indexOf(list),
            count: list.querySelectorAll(':scope > [role="tab"]').length,
            from: list.tabFrame,
            at: performance.now()
        };
        list.querySelectorAll(':scope > [role="tab"]').forEach(function (other) {
            other.setAttribute('aria-selected', String(other === tab));
        });
    });
    document.addEventListener('page:swapped', setupAll);
    document.addEventListener('htmx:afterSettle', setupAll);
    setupAll();
})();
(function () {
    var observed = new WeakSet();
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            entry.target.toggleAttribute('data-stuck', entry.intersectionRatio < 1);
        });
    }, {rootMargin: '0px 0px -13px 0px', threshold: 1});
    function observeAll() {
        document.querySelectorAll('.form-actions').forEach(function (actions) {
            if (observed.has(actions)) return;
            observed.add(actions);
            observer.observe(actions);
        });
    }
    document.addEventListener('page:swapped', observeAll);
    document.addEventListener('htmx:afterSettle', observeAll);
    observeAll();
})();
(function () {
    var duration = 260;
    var easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
    function calm() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    function setupSidebar() {
        var section = document.querySelector('.sidebar nav > section');
        if (!section || section.querySelector(':scope > .sidebar-indicator')) return;
        var indicator = document.createElement('span');
        indicator.className = 'sidebar-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        section.prepend(indicator);
        var last = null;
        function place(animate) {
            var link = section.querySelector('a[aria-current="page"]');
            indicator.hidden = !link || !link.offsetWidth;
            if (indicator.hidden) return;
            var box = section.getBoundingClientRect();
            var rect = link.getBoundingClientRect();
            var next = {x: rect.left - box.left + section.scrollLeft, y: rect.top - box.top + section.scrollTop, w: rect.width, h: rect.height};
            indicator.style.width = next.w + 'px';
            indicator.style.height = next.h + 'px';
            indicator.style.transform = 'translate(' + next.x + 'px, ' + next.y + 'px)';
            if (animate && last && last.y !== next.y && !calm()) {
                indicator.animate([
                    {transform: 'translate(' + last.x + 'px, ' + last.y + 'px)'},
                    {transform: indicator.style.transform}
                ], {duration: duration, easing: easing});
            }
            last = next;
        }
        place(false);
        new MutationObserver(function () {
            place(true);
        }).observe(section, {attributes: true, attributeFilter: ['aria-current'], subtree: true});
        new ResizeObserver(function () {
            place(false);
        }).observe(section);
    }
    document.addEventListener('htmx:afterSettle', function (event) {
        var config = event.detail.requestConfig;
        if (!config || config.verb !== 'get' || calm()) return;
        var target = event.detail.target;
        if (target && target.isConnected && target.animate) target.animate({opacity: [0.55, 1]}, {duration: 160, easing: 'ease-out'});
    });
    setupSidebar();
})();
