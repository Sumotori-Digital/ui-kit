window.uiToast = function (data) {
    var toaster = document.getElementById("toaster");
    function show() {
        var toast = toaster.toast(data);
        var button =
            data.action &&
            data.duration > 0 &&
            toast.querySelector("[data-toast-action]");
        if (!button) return;
        var left = Math.ceil(data.duration / 1000);
        var label = data.action.label;
        button.textContent = label + " (" + left + " с)";
        var timer = setInterval(function () {
            if (toaster.matches(":hover")) return;
            left -= 1;
            if (left <= 0 || !toast.isConnected)
                return clearInterval(timer);
            button.textContent = label + " (" + left + " с)";
        }, 1000);
    }
    if (toaster.toast) show();
    else
        toaster.addEventListener("basecoat:initialized", show, {
            once: true,
        });
};
