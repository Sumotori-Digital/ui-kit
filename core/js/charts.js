document.addEventListener('alpine:init', function () {
    var SVG = 'http://www.w3.org/2000/svg';
    var MARGIN = {top: 12, right: 8, bottom: 28, left: 64};
    var MAX_BAR = 24;
    var GAP = 2;
    var RADIUS = 4;
    var PLAY_MS = 2200;

    function el(name, attrs, parent) {
        var node = document.createElementNS(SVG, name);
        Object.keys(attrs || {}).forEach(function (key) {
            node.setAttribute(key, attrs[key]);
        });
        if (parent) parent.appendChild(node);
        return node;
    }

    function niceStep(raw) {
        if (raw <= 0) return 1;
        var power = Math.pow(10, Math.floor(Math.log10(raw)));
        var fraction = raw / power;
        var nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
        return nice * power;
    }

    function compact(value) {
        var abs = Math.abs(value);
        var sign = value < 0 ? '−' : '';
        var trim = function (n) {
            return (Math.round(n * 10) / 10).toString().replace('.', ',');
        };
        if (abs >= 1e6) return sign + trim(abs / 1e6) + ' млн';
        if (abs >= 1e3) return sign + trim(abs / 1e3) + ' тыс';
        return sign + abs;
    }

    function grouped(value) {
        return Math.abs(Math.round(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function money(value) {
        return (Math.round(value) < 0 ? '−' : '') + '¥' + grouped(value);
    }

    function formatValue(value, format) {
        if (format === 'money') return money(value);
        if (format === 'percent') return (Math.round(value) < 0 ? '−' : '') + grouped(value) + '%';
        return (Math.round(value) < 0 ? '−' : '') + grouped(value);
    }

    function upPath(x, y, width, height) {
        if (height <= 0) return '';
        var r = Math.min(RADIUS, height, width / 2);
        return 'M' + x + ',' + (y + height) +
            'V' + (y + r) +
            'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
            'H' + (x + width - r) +
            'Q' + (x + width) + ',' + y + ' ' + (x + width) + ',' + (y + r) +
            'V' + (y + height) + 'Z';
    }

    function downPath(x, y, width, height) {
        if (height <= 0) return '';
        var r = Math.min(RADIUS, height, width / 2);
        return 'M' + x + ',' + y +
            'V' + (y + height - r) +
            'Q' + x + ',' + (y + height) + ' ' + (x + r) + ',' + (y + height) +
            'H' + (x + width - r) +
            'Q' + (x + width) + ',' + (y + height) + ' ' + (x + width) + ',' + (y + height - r) +
            'V' + y + 'Z';
    }

    function reducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function whenPageReady(callback) {
        var root = document.documentElement;
        if (root.classList.contains('page-ready')) {
            callback();
            return;
        }
        var observer = new MutationObserver(function () {
            if (root.classList.contains('page-ready')) {
                observer.disconnect();
                callback();
            }
        });
        observer.observe(root, {attributes: true, attributeFilter: ['class']});
    }

    function reveal(target, play) {
        whenPageReady(function () {
            var observer = new IntersectionObserver(function (entries) {
                if (entries.some(function (e) { return e.isIntersecting; })) {
                    observer.disconnect();
                    requestAnimationFrame(play);
                }
            }, {threshold: 0.2});
            observer.observe(target);
        });
    }

    function animated(component, target) {
        component.state = reducedMotion() ? 'done' : 'pending';
        if (component.state === 'done') return;
        reveal(target, function () {
            component.state = 'playing';
            component.apply();
            setTimeout(function () {
                component.state = 'done';
                component.apply();
            }, PLAY_MS);
        });
    }

    function onWidthChange(target, callback) {
        var width = target.clientWidth;
        var timer = null;
        var observer = new ResizeObserver(function () {
            if (!target.isConnected) {
                observer.disconnect();
                clearTimeout(timer);
                return;
            }
            if (target.clientWidth === width) return;
            width = target.clientWidth;
            clearTimeout(timer);
            timer = setTimeout(callback, 120);
        });
        observer.observe(target);
    }

    function tooltip(tip, plot, x, title, rows) {
        tip.replaceChildren();
        var heading = document.createElement('p');
        heading.textContent = title;
        var items = document.createElement('div');
        items.className = 'chart-tooltip-items';
        rows.forEach(function (r) {
            var row = document.createElement('div');
            row.className = 'chart-tooltip-item';
            row.setAttribute('data-series', r.key);
            var key = document.createElement('span');
            key.className = 'chart-tooltip-indicator';
            var label = document.createElement('span');
            label.className = 'chart-tooltip-label';
            label.textContent = r.label;
            var value = document.createElement('span');
            value.className = 'chart-tooltip-value';
            value.textContent = money(r.value);
            row.append(key, label, value);
            items.appendChild(row);
        });
        tip.append(heading, items);
        var box = plot.getBoundingClientRect();
        tip.style.left = (box.left + x) + 'px';
        tip.style.top = (box.top + MARGIN.top) + 'px';
        tip.hidden = false;
    }

    function axis(svg, y, from, to, step, width) {
        for (var tick = from; tick <= to + step / 2; tick += step) {
            el('line', {
                class: Math.abs(tick) < step / 2 ? 'chart-axis' : 'chart-grid',
                x1: MARGIN.left, x2: width - MARGIN.right, y1: y(tick), y2: y(tick)
            }, svg);
            var label = el('text', {
                class: 'chart-tick', x: MARGIN.left - 8, y: y(tick),
                'text-anchor': 'end', 'dominant-baseline': 'middle'
            }, svg);
            label.textContent = compact(tick);
        }
    }

    function hoverBand(svg, component, bandX, band, innerHeight, label, point, center) {
        var highlight = el('rect', {class: 'chart-band', x: bandX, y: MARGIN.top, width: band, height: innerHeight}, svg);
        svg.insertBefore(highlight, svg.firstChild);
        var hit = el('rect', {
            class: 'chart-hit', x: bandX, y: MARGIN.top, width: band,
            height: innerHeight + MARGIN.bottom, tabindex: 0, role: 'img', 'aria-label': label
        }, svg);
        var show = function () {
            highlight.classList.add('is-active');
            component.showTip(point, center);
        };
        var hide = function () {
            highlight.classList.remove('is-active');
            component.$refs.tip.hidden = true;
        };
        hit.addEventListener('pointerenter', show);
        hit.addEventListener('focus', show);
        hit.addEventListener('pointerleave', hide);
        hit.addEventListener('blur', hide);
    }

    function chartComponent(render) {
        return function () {
            return {
                data: null,
                svg: null,
                state: 'done',

                init: function () {
                    this.data = JSON.parse(this.$refs.data.textContent);
                    var self = this;
                    animated(this, this.$refs.plot);
                    this.draw();
                    onWidthChange(this.$refs.plot, function () {
                        if (self.state === 'playing') self.state = 'done';
                        self.draw();
                    });
                    window.addEventListener('scroll', function () {
                        self.$refs.tip.hidden = true;
                    }, {passive: true});
                },

                apply: function () {
                    if (this.svg) this.svg.setAttribute('data-state', this.state);
                },

                draw: function () {
                    var plot = this.$refs.plot;
                    if (!plot) return;
                    var width = plot.clientWidth;
                    var height = plot.clientHeight;
                    if (!width || !height) return;
                    var svg = el('svg', {width: width, height: height, viewBox: '0 0 ' + width + ' ' + height});
                    render.call(this, svg, width, height);
                    this.svg = svg;
                    this.apply();
                    plot.replaceChildren(svg);
                },

                showTip: function (point, x) {
                    tooltip(this.$refs.tip, this.$refs.plot, x, point.label, this.tipRows(point));
                }
            };
        };
    }

    Alpine.data('columnChart', function () {
        var base = chartComponent(function (svg, width, height) {
            var data = this.data;
            var points = data.points;
            var series = data.series;
            var innerWidth = width - MARGIN.left - MARGIN.right;
            var innerHeight = height - MARGIN.top - MARGIN.bottom;
            var max = 0;
            points.forEach(function (p) {
                series.forEach(function (s) {
                    max = Math.max(max, Number(p[s.key]) || 0);
                });
            });
            var step = niceStep(max / 4);
            var top = Math.max(step, Math.ceil(max / step) * step);
            var y = function (value) {
                return MARGIN.top + innerHeight - (value / top) * innerHeight;
            };
            axis(svg, y, 0, top, step, width);
            var band = innerWidth / points.length;
            var barWidth = Math.max(4, Math.min(MAX_BAR, (band * 0.6 - GAP * (series.length - 1)) / series.length));
            var groupWidth = barWidth * series.length + GAP * (series.length - 1);
            var labelEvery = Math.max(1, Math.ceil(56 / band));
            var self = this;
            points.forEach(function (point, index) {
                var bandX = MARGIN.left + band * index;
                var groupX = bandX + (band - groupWidth) / 2;
                series.forEach(function (s, i) {
                    var value = Number(point[s.key]) || 0;
                    var bar = el('path', {
                        class: 'chart-bar',
                        'data-series': s.key,
                        d: upPath(groupX + i * (barWidth + GAP), y(value), barWidth, y(0) - y(value))
                    }, svg);
                    bar.style.transformOrigin = '0 ' + y(0) + 'px';
                    bar.style.animationDelay = (index * 60) + 'ms';
                });
                if (index % labelEvery === 0) {
                    var text = el('text', {class: 'chart-tick', x: bandX + band / 2, y: height - MARGIN.bottom + 18, 'text-anchor': 'middle'}, svg);
                    text.textContent = point.label;
                }
                hoverBand(svg, self, bandX, band, innerHeight, self.describe(point), point, bandX + band / 2);
            });
        })();
        base.describe = function (point) {
            var parts = [point.label];
            this.data.series.forEach(function (s) {
                parts.push(s.label + ' ' + money(point[s.key]));
            });
            if (this.data.total) parts.push(this.data.total.label + ' ' + money(point[this.data.total.key]));
            return parts.join(', ');
        };
        base.tipRows = function (point) {
            var rows = this.data.series.slice();
            if (this.data.total) rows.push(this.data.total);
            return rows.map(function (s) {
                return {key: s.key, label: s.label, value: point[s.key]};
            });
        };
        return base;
    });

    Alpine.data('profitChart', function () {
        var base = chartComponent(function (svg, width, height) {
            var points = this.data.points;
            var innerWidth = width - MARGIN.left - MARGIN.right;
            var innerHeight = height - MARGIN.top - MARGIN.bottom;
            var values = [];
            points.forEach(function (p) {
                values.push(Number(p.profit) || 0, Number(p.cumulative) || 0);
            });
            var low = Math.min.apply(null, values.concat([0]));
            var high = Math.max.apply(null, values.concat([0]));
            var step = niceStep((high - low) / 4 || 1);
            var bottom = Math.floor(low / step) * step;
            var top = Math.max(step, Math.ceil(high / step) * step);
            var y = function (value) {
                return MARGIN.top + innerHeight - ((value - bottom) / (top - bottom)) * innerHeight;
            };
            axis(svg, y, bottom, top, step, width);
            var band = innerWidth / points.length;
            var barWidth = Math.max(6, Math.min(MAX_BAR * 1.5, band * 0.45));
            var labelEvery = Math.max(1, Math.ceil(56 / band));
            var self = this;
            var line = [];
            points.forEach(function (point, index) {
                var bandX = MARGIN.left + band * index;
                var center = bandX + band / 2;
                var value = Number(point.profit) || 0;
                var zero = y(0);
                var h = Math.abs(zero - y(value));
                var x = center - barWidth / 2;
                var bar = el('path', {
                    class: 'chart-bar',
                    'data-series': value >= 0 ? 'profit' : 'loss',
                    d: value >= 0 ? upPath(x, y(value), barWidth, h) : downPath(x, zero, barWidth, h)
                }, svg);
                bar.style.transformOrigin = '0 ' + zero + 'px';
                bar.style.animationDelay = (index * 80) + 'ms';
                line.push([center, y(Number(point.cumulative) || 0)]);
                if (index % labelEvery === 0) {
                    var text = el('text', {class: 'chart-tick', x: center, y: height - MARGIN.bottom + 18, 'text-anchor': 'middle'}, svg);
                    text.textContent = point.label;
                }
            });
            el('path', {
                class: 'chart-line', 'data-series': 'cumulative', pathLength: 1,
                d: line.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ',' + p[1]; }).join('')
            }, svg);
            var last = line[line.length - 1];
            el('circle', {class: 'chart-dot', 'data-series': 'cumulative', cx: last[0], cy: last[1], r: 5}, svg);
            var end = el('text', {class: 'chart-end-label', x: Math.min(last[0], width - MARGIN.right), y: last[1] - 12, 'text-anchor': 'end'}, svg);
            end.textContent = money(points[points.length - 1].cumulative);
            points.forEach(function (point, index) {
                var bandX = MARGIN.left + band * index;
                hoverBand(
                    svg, self, bandX, band, innerHeight,
                    point.label + ', результат месяца ' + money(point.profit) + ', итог с начала периода ' + money(point.cumulative),
                    point, bandX + band / 2
                );
            });
        })();
        base.tipRows = function (point) {
            return [
                {key: Number(point.profit) >= 0 ? 'profit' : 'loss', label: 'Результат месяца', value: point.profit},
                {key: 'cumulative', label: 'Итог с начала периода', value: point.cumulative}
            ];
        };
        return base;
    });

    Alpine.data('sparkline', function () {
        return {
            state: 'done',
            svg: null,

            init: function () {
                var self = this;
                animated(this, this.$el);
                this.draw();
                onWidthChange(this.$el, function () {
                    if (self.state === 'playing') self.state = 'done';
                    self.draw();
                });
            },

            apply: function () {
                if (this.svg) this.svg.setAttribute('data-state', this.state);
            },

            draw: function () {
                var values = (this.$el.dataset.points || '').split(',').filter(Boolean).map(Number);
                var width = this.$el.clientWidth;
                if (values.length < 2 || !width) return;
                var height = 80;
                var min = Math.min.apply(null, values.concat([0]));
                var max = Math.max.apply(null, values.concat([0]));
                var span = max - min || 1;
                var x = function (i) { return (i / (values.length - 1)) * (width - 10) + 5; };
                var y = function (v) { return height - 6 - ((v - min) / span) * (height - 12); };
                var svg = el('svg', {width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, 'aria-hidden': 'true'});
                el('line', {class: 'spark-zero', x1: 0, x2: width, y1: y(0), y2: y(0)}, svg);
                var d = values.map(function (v, i) { return (i ? 'L' : 'M') + x(i) + ',' + y(v); }).join('');
                el('path', {class: 'spark-area', d: d + 'L' + x(values.length - 1) + ',' + y(0) + 'L' + x(0) + ',' + y(0) + 'Z'}, svg);
                el('path', {class: 'spark-line', d: d, pathLength: 1}, svg);
                el('circle', {class: 'spark-dot', cx: x(values.length - 1), cy: y(values[values.length - 1]), r: 4}, svg);
                this.svg = svg;
                this.apply();
                this.$el.replaceChildren(svg);
            }
        };
    });

    Alpine.data('reveal', function () {
        return {
            state: 'done',

            init: function () {
                animated(this, this.$el);
                this.apply();
            },

            apply: function () {
                this.$el.setAttribute('data-state', this.state);
            }
        };
    });

    Alpine.data('countUp', function () {
        return {
            init: function () {
                var node = this.$el;
                var target = Number(node.dataset.value);
                var format = node.dataset.format || 'number';
                if (!isFinite(target) || reducedMotion()) return;
                var finalText = node.textContent;
                node.style.width = 'max-content';
                node.style.minWidth = Math.ceil(node.getBoundingClientRect().width) + 'px';
                node.style.width = '';
                node.textContent = formatValue(0, format);
                reveal(node, function () {
                    var start = null;
                    var duration = 1200;
                    var step = function (time) {
                        if (start === null) start = time;
                        var t = Math.min(1, (time - start) / duration);
                        var eased = 1 - Math.pow(1 - t, 3);
                        node.textContent = formatValue(target * eased, format);
                        if (t < 1) {
                            requestAnimationFrame(step);
                        } else {
                            node.textContent = finalText;
                        }
                    };
                    requestAnimationFrame(step);
                });
            }
        };
    });
});
