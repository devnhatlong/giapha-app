/* ============================================================
   search-select.js
   Dropdown có ô tìm kiếm — thuần JS, không thư viện ngoài (offline).
   Gắn class "search-select" vào <select> rồi gọi SearchSelect.enhance().
   ============================================================ */

const SearchSelect = {
    _map: new WeakMap(),

    enhance(select) {
        if (!select || select.dataset.searchSelect === "1") return;

        select.dataset.searchSelect = "1";
        select.classList.add("search-select-native");

        const wrap = document.createElement("div");
        wrap.className = "search-select";
        select.parentNode.insertBefore(wrap, select);
        wrap.appendChild(select);

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "search-select-trigger";
        trigger.innerHTML =
            '<span class="search-select-label"></span><span class="search-select-caret" aria-hidden="true">▾</span>';

        const panel = document.createElement("div");
        panel.className = "search-select-panel";
        panel.hidden = true;

        const input = document.createElement("input");
        input.type = "text";
        input.className = "search-select-input";
        input.placeholder = "Tìm kiếm...";
        input.autocomplete = "off";
        input.setAttribute("aria-label", "Tìm trong danh sách");

        const list = document.createElement("ul");
        list.className = "search-select-list";
        list.setAttribute("role", "listbox");

        panel.appendChild(input);
        panel.appendChild(list);
        wrap.appendChild(trigger);
        wrap.appendChild(panel);

        const state = { wrap, select, trigger, panel, input, list, open: false };
        this._map.set(select, state);

        trigger.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle(select);
        });

        input.addEventListener("input", () => this._renderList(select));
        input.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.close(select);
                trigger.focus();
            }
        });

        list.addEventListener("click", (e) => {
            const item = e.target.closest("[data-value]");
            if (!item || item.classList.contains("search-select-empty")) return;
            select.value = item.dataset.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            this.close(select);
            this._syncLabel(select);
        });

        select.addEventListener("change", () => this._syncLabel(select));

        new MutationObserver(() => {
            this._renderList(select);
            this._syncLabel(select);
        }).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["selected"] });

        document.addEventListener("click", (e) => {
            if (!wrap.contains(e.target)) this.close(select);
        });

        this._syncLabel(select);
        this._renderList(select);
    },

    _norm(str) {
        return String(str || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    },

    _syncLabel(select) {
        const state = this._map.get(select);
        if (!state) return;
        const opt = select.options[select.selectedIndex];
        state.trigger.querySelector(".search-select-label").textContent =
            opt && opt.textContent.trim() ? opt.textContent.trim() : "— Chọn —";
    },

    _renderList(select) {
        const state = this._map.get(select);
        if (!state) return;

        const q = this._norm(state.input.value.trim());
        state.list.innerHTML = "";
        let shown = 0;

        Array.from(select.options).forEach((opt) => {
            const label = opt.textContent.trim();
            if (q && !this._norm(label).includes(q)) return;

            const li = document.createElement("li");
            li.className = "search-select-option";
            if (opt.selected) li.classList.add("selected");
            if (opt.disabled) li.classList.add("disabled");
            li.dataset.value = opt.value;
            li.textContent = label;
            li.setAttribute("role", "option");
            state.list.appendChild(li);
            shown++;
        });

        if (shown === 0) {
            const empty = document.createElement("li");
            empty.className = "search-select-empty";
            empty.textContent = "Không tìm thấy";
            state.list.appendChild(empty);
        }
    },

    open(select) {
        this.closeAll();
        const state = this._map.get(select);
        if (!state) return;
        state.open = true;
        state.panel.hidden = false;
        state.wrap.classList.add("open");
        state.input.value = "";
        this._renderList(select);

        const rect = state.trigger.getBoundingClientRect();
        document.body.appendChild(state.panel);
        state.panel.style.position = "fixed";
        state.panel.style.left = `${rect.left}px`;
        state.panel.style.top = `${rect.bottom + 4}px`;
        state.panel.style.width = `${rect.width}px`;
        state.panel.style.zIndex = "1000";

        state.input.focus();
    },

    close(select) {
        const state = this._map.get(select);
        if (!state) return;
        state.open = false;
        state.panel.hidden = true;
        state.wrap.classList.remove("open");
        state.panel.style.position = "";
        state.panel.style.left = "";
        state.panel.style.top = "";
        state.panel.style.width = "";
        state.panel.style.zIndex = "";
        state.wrap.appendChild(state.panel);
    },

    toggle(select) {
        const state = this._map.get(select);
        if (!state) return;
        if (state.open) this.close(select);
        else this.open(select);
    },

    closeAll() {
        document.querySelectorAll("select.search-select-native").forEach((s) => this.close(s));
    },

    refresh(select) {
        this._renderList(select);
        this._syncLabel(select);
    },

    initAll() {
        document.querySelectorAll("select.search-select").forEach((s) => this.enhance(s));
    },
};

window.SearchSelect = SearchSelect;

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => SearchSelect.initAll());
} else {
    SearchSelect.initAll();
}
