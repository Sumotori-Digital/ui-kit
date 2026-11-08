(function () {
    var initial = new WeakMap();
    var touched = new WeakSet();
    var sequence = 0;

    function rulesOf(control) {
        try {
            return JSON.parse(control.dataset.rules || "{}");
        } catch (error) {
            return {};
        }
    }

    function isChoice(control) {
        return control.type === "hidden";
    }

    function fieldOf(element) {
        var field = element && element.closest && element.closest(".field");
        if (!field || !field.closest("form")) return null;
        var form = field.closest("form");
        return form.method === "post" ? field : null;
    }

    function controlOf(field) {
        var ruled = Array.from(field.querySelectorAll("[data-rules]")).find(function (el) {
            return !el.closest("[data-popover]");
        });
        if (ruled) return ruled;
        return Array.from(
            field.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea")
        ).find(function (el) {
            return !el.closest("[data-popover]");
        }) || null;
    }

    function targetOf(field, control) {
        return isChoice(control) ? field.querySelector("[aria-haspopup=listbox]") || control : control;
    }

    function describe(field) {
        var control = controlOf(field);
        if (!control) return;
        var target = targetOf(field, control);
        var ids = Array.from(field.querySelectorAll(":scope > p")).map(function (message) {
            if (!message.id) message.id = "field-message-" + (++sequence);
            return message.id;
        });
        if (ids.length) target.setAttribute("aria-describedby", ids.join(" "));
        else target.removeAttribute("aria-describedby");
    }

    function foldedAway(element) {
        var folded = false;
        for (var node = element; node; node = node.parentElement) {
            if (node.matches("details:not([open])")) folded = true;
            if (node.matches("[role=tabpanel][hidden]")) {
                folded = true;
                continue;
            }
            if (getComputedStyle(node).display === "none") return false;
        }
        return folded;
    }

    function active(field, control) {
        var target = targetOf(field, control);
        if (control.disabled || target.disabled || control.closest("fieldset:disabled")) return false;
        return target.getClientRects().length > 0 || foldedAway(target);
    }

    function number(value) {
        var plain = value.replace(/[\s,¥]/g, "");
        return plain === "" || isNaN(plain) ? null : plain;
    }

    function messageOf(control) {
        var r = rulesOf(control);
        var value = isChoice(control) ? control.value : control.value.trim();
        if (!value) {
            if (!("required" in r) && !control.required) return "";
            return r.required || (isChoice(control) ? "Выберите значение" : "Заполните поле");
        }
        if (control.validity && control.validity.customError) return control.validationMessage;
        if ((r.maxLength != null && value.length > r.maxLength) || (r.minLength != null && value.length < r.minLength)) {
            return r.length || (r.maxLength != null && value.length > r.maxLength ? "Не длиннее " + r.maxLength + " символов" : "Не короче " + r.minLength + " символов");
        }
        if (r.pattern && !new RegExp("^(?:" + r.pattern + ")$").test(value)) return r.patternMessage || control.title || "Проверьте формат";
        if ("email" in r && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return r.email || "Проверьте формат";
        if (r.min != null || r.max != null || r.integer != null) {
            var plain = number(value);
            if (plain === null) return r.digits || r.minMessage || "Введите число";
            var parts = plain.replace("-", "").split(".");
            if (r.integer != null && (parts[0].replace(/^0+(?=\d)/, "").length > r.integer || (parts[1] || "").replace(/0+$/, "").length > r.fraction)) {
                return r.digits || "Проверьте число";
            }
            var x = Number(plain);
            if (r.min != null && (r.minExclusive ? x <= Number(r.min) : x < Number(r.min))) return r.minMessage || "Не меньше " + r.min;
            if (r.max != null && (r.maxExclusive ? x >= Number(r.max) : x > Number(r.max))) return r.maxMessage || "Не больше " + r.max;
        }
        if (control.validity && !isChoice(control)) {
            var v = control.validity;
            if (v.patternMismatch) return control.title || "Проверьте формат";
            if (v.badInput || v.typeMismatch) return "Проверьте формат";
            if (v.rangeUnderflow) return "Не меньше " + control.min;
            if (v.rangeOverflow) return "Не больше " + control.max;
            if (v.stepMismatch) return "Проверьте значение";
        }
        return "";
    }

    function validate(field, submitting) {
        var control = controlOf(field);
        if (!control || !active(field, control)) return null;
        var target = targetOf(field, control);
        var alert = field.querySelector(":scope > p[role=alert]");
        var text = messageOf(control);
        if (!text) {
            var changed = !initial.has(control) || initial.get(control) !== control.value;
            if (alert && !alert.hasAttribute("data-live") && !changed) return submitting ? null : target;
            delete field.dataset.invalid;
            target.removeAttribute("aria-invalid");
            if (alert) alert.remove();
            describe(field);
            return null;
        }
        field.dataset.invalid = "true";
        target.setAttribute("aria-invalid", "true");
        if (!alert) {
            alert = document.createElement("p");
            alert.setAttribute("role", "alert");
            field.appendChild(alert);
        }
        alert.setAttribute("data-live", "");
        alert.textContent = text;
        describe(field);
        return target;
    }

    function prepare(root) {
        root.querySelectorAll(".field").forEach(describe);
        root.querySelectorAll("form").forEach(function (form) {
            if (form.method !== "post") return;
            form.noValidate = true;
            form.querySelectorAll(".field").forEach(function (field) {
                var control = controlOf(field);
                if (control && !initial.has(control)) initial.set(control, control.value);
            });
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        prepare(document);
    });
    document.addEventListener("htmx:afterSwap", function (event) {
        prepare(event.target);
    });
    document.addEventListener("page:swapped", function () {
        prepare(document);
    });

    document.addEventListener("focusout", function (event) {
        var field = fieldOf(event.target);
        if (!field || field.contains(event.relatedTarget)) return;
        setTimeout(function () {
            if (field.contains(document.activeElement)) return;
            touched.add(field);
            validate(field);
        }, 150);
    });

    function revalidate(event) {
        if (event.target.closest && event.target.closest("[data-popover]")) return;
        var field = fieldOf(event.target);
        if (!field) return;
        if (event.type === "change") touched.add(field);
        if (touched.has(field) || field.dataset.invalid) validate(field);
    }
    document.addEventListener("input", revalidate);
    document.addEventListener("change", revalidate);

    document.addEventListener("click", function (event) {
        var button = event.target.closest && event.target.closest("button, input[type=submit]");
        if (button && button.form && button.form.method === "post") button.form.noValidate = true;
    }, true);

    document.addEventListener("submit", function (event) {
        var form = event.target;
        if (form.method !== "post") return;
        if (event.submitter && event.submitter.formNoValidate) return;
        var first = null;
        form.querySelectorAll(".field").forEach(function (field) {
            touched.add(field);
            var bad = validate(field, true);
            if (bad && !first) first = bad;
        });
        if (!first) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        var panel = first.closest("[role=tabpanel][hidden]");
        var tab = panel && document.querySelector('[role=tab][aria-controls="' + panel.id + '"]');
        if (tab) tab.click();
        var collapsed = first.closest("details:not([open])");
        if (collapsed) collapsed.open = true;
        function reveal(frames) {
            first.focus({ preventScroll: true });
            if (document.activeElement !== first && frames > 0) {
                requestAnimationFrame(function () {
                    reveal(frames - 1);
                });
                return;
            }
            first.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        reveal(30);
    }, true);
})();
