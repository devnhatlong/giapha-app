/* ============================================================
   ui.js — Popup xác nhận & toast (offline, không thư viện ngoài)
   ============================================================ */

const confirmOverlay = document.getElementById("confirm-overlay");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmOkBtn = document.getElementById("confirm-ok");
const confirmCancelBtn = document.getElementById("confirm-cancel");
const toastContainer = document.getElementById("toast-container");

let confirmResolver = null;

function showConfirm(options) {
    const {
        title = "Xác nhận",
        message = "",
        confirmText = "Xác nhận",
        cancelText = "Hủy",
        danger = false,
    } = typeof options === "string" ? { message: options } : options;

    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = confirmText;
    confirmCancelBtn.textContent = cancelText;
    confirmOkBtn.classList.toggle("btn-danger", danger);
    confirmOkBtn.classList.toggle("btn", true);

    confirmOverlay.classList.add("open");

    return new Promise((resolve) => {
        confirmResolver = resolve;
    });
}

function closeConfirm(result) {
    confirmOverlay.classList.remove("open");
    if (confirmResolver) {
        confirmResolver(result);
        confirmResolver = null;
    }
}

confirmOkBtn.addEventListener("click", () => closeConfirm(true));
confirmCancelBtn.addEventListener("click", () => closeConfirm(false));
confirmOverlay.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) closeConfirm(false);
});

document.addEventListener("keydown", (e) => {
    if (!confirmOverlay.classList.contains("open")) return;
    if (e.key === "Escape") closeConfirm(false);
    if (e.key === "Enter") closeConfirm(true);
});

function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

window.showConfirm = showConfirm;
window.showToast = showToast;
