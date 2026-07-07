/* ============================================================
   app.js
   ------
   File này xử lý TOÀN BỘ logic phía giao diện:
   - Chuyển tab (Tổng quan / Thành viên / Cây gia phả / Sự kiện)
   - Gọi API backend (fetch) để lấy/gửi dữ liệu
   - Vẽ sơ đồ cây gia phả bằng SVG (không cần thư viện ngoài -> chạy offline)
   - OFFLINE: chỉ gọi API nội bộ (/api), không CDN, không script/font từ internet

   Ghi chú cho người mới học:
   - "async function" + "await fetch(...)" là cách JavaScript gọi API
     và CHỜ kết quả trả về trước khi làm bước tiếp theo.
   - API_BASE là đường dẫn tương đối tới backend local (cùng máy, cổng 8756)
   ============================================================ */

const API_BASE = "/api"; // Luôn local — không đổi thành URL internet

// Biến lưu trạng thái tạm thời trong phiên làm việc
let allPersons = [];
let currentDetailId = null;

// ============================================================
// TIỆN ÍCH GỌI API
// ============================================================
async function apiGet(path) {
    const res = await fetch(API_BASE + path);
    if (!res.ok) throw new Error("Lỗi khi tải dữ liệu: " + path);
    return res.json();
}

async function apiSend(path, method, body) {
    const res = await fetch(API_BASE + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Có lỗi xảy ra");
    }
    return res.json();
}

function formatYear(dateStr) {
    if (!dateStr) return "?";
    return dateStr.split("-")[0];
}

function genderLabel(g) {
    return g === "male" ? "Nam" : g === "female" ? "Nữ" : "Khác";
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function avatarUrl(path) {
    if (!path) return "";
    return `/uploads/${path}?v=${Date.now()}`;
}

function avatarInitials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
}

function renderAvatarHtml(name, avatarPath, sizeClass) {
    const cls = sizeClass ? `avatar ${sizeClass}` : "avatar";
    if (avatarPath) {
        return `<div class="${cls}"><img src="${avatarUrl(avatarPath)}" alt="${escapeHtml(name)}" /></div>`;
    }
    return `<div class="${cls}"><span class="avatar-fallback">${escapeHtml(avatarInitials(name))}</span></div>`;
}

function setAvatarElement(el, name, avatarPath, defaultFallback) {
    if (avatarPath) {
        el.innerHTML = `<img src="${avatarUrl(avatarPath)}" alt="${escapeHtml(name || "")}" />`;
    } else {
        el.innerHTML = `<span class="avatar-fallback">${escapeHtml(defaultFallback || avatarInitials(name))}</span>`;
    }
}

async function apiUpload(path, file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(API_BASE + path, { method: "POST", body: form });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Upload thất bại");
    }
    return res.json();
}

async function apiDelete(path) {
    const res = await fetch(API_BASE + path, { method: "DELETE" });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Có lỗi xảy ra");
    }
    return res.json();
}

// ============================================================
// AVATAR GIA PHẢ
// ============================================================
function updateFamilyAvatarUI(avatarPath) {
    const img = document.getElementById("family-avatar-img");
    const fallback = document.getElementById("family-avatar-fallback");
    const dashboard = document.getElementById("dashboard-family-avatar");

    if (avatarPath) {
        const url = avatarUrl(avatarPath);
        img.src = url;
        img.hidden = false;
        fallback.hidden = true;
        dashboard.innerHTML = `<img src="${url}" alt="Gia phả" />`;
    } else {
        img.hidden = true;
        img.removeAttribute("src");
        fallback.hidden = false;
        dashboard.innerHTML = `<span class="avatar-fallback">GP</span>`;
    }
}

async function loadFamilyAvatar() {
    const settings = await apiGet("/settings");
    updateFamilyAvatarUI(settings.family_avatar_path || null);
}

document.getElementById("btn-change-family-avatar").addEventListener("click", () => {
    document.getElementById("family-avatar-input").click();
});

document.getElementById("family-avatar-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
        const result = await apiUpload("/settings/family-avatar", file);
        updateFamilyAvatarUI(result.family_avatar_path);
    } catch (err) {
        alert(err.message);
    }
});

document.getElementById("btn-remove-family-avatar").addEventListener("click", async () => {
    if (!confirm("Xóa ảnh đại diện gia phả?")) return;
    try {
        await apiDelete("/settings/family-avatar");
        updateFamilyAvatarUI(null);
    } catch (err) {
        alert(err.message);
    }
});

// ============================================================
// ĐIỀU HƯỚNG GIỮA CÁC TAB
// ============================================================
function showTab(tabName) {
    document.querySelectorAll(".tab-content").forEach(el => (el.style.display = "none"));
    document.getElementById("tab-" + tabName).style.display = "block";
    document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
    const navBtn = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    if (navBtn) navBtn.classList.add("active");

    if (tabName === "dashboard") loadDashboard();
    if (tabName === "members") loadMembers();
    if (tabName === "tree") loadTree();
    if (tabName === "events") loadEvents();
}

document.querySelectorAll(".nav-item[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

// ============================================================
// TAB: TỔNG QUAN (DASHBOARD)
// ============================================================
async function loadDashboard() {
    const stats = await apiGet("/stats");
    const grid = document.getElementById("stats-grid");
    grid.innerHTML = `
        <div class="stat-card"><div class="stat-number">${stats.total_members}</div><div class="stat-label">Tổng thành viên</div></div>
        <div class="stat-card"><div class="stat-number">${stats.alive}</div><div class="stat-label">Còn sống</div></div>
        <div class="stat-card"><div class="stat-number">${stats.deceased}</div><div class="stat-label">Đã mất</div></div>
        <div class="stat-card"><div class="stat-number">${stats.generations}</div><div class="stat-label">Số đời đã ghi nhận</div></div>
    `;

    const events = await apiGet("/events");
    const wrap = document.getElementById("upcoming-events");
    if (events.length === 0) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div>Chưa có sự kiện nào được ghi nhận.</div>`;
    } else {
        wrap.innerHTML = `<ul class="relation-list">` + events.map(e => `
            <li>
                <span><strong>${e.full_name}</strong> — ${eventTypeLabel(e.event_type)} (${e.event_date || "chưa rõ ngày"}, ${e.calendar_type === "lunar" ? "âm lịch" : "dương lịch"})</span>
            </li>
        `).join("") + `</ul>`;
    }
}

function eventTypeLabel(t) {
    if (t === "death_anniversary") return "Ngày giỗ";
    if (t === "birthday") return "Sinh nhật";
    return "Sự kiện";
}

// ============================================================
// TAB: DANH SÁCH THÀNH VIÊN
// ============================================================
async function loadMembers(search) {
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    allPersons = await apiGet("/persons" + q);
    renderMembersTable();
}

function renderMembersTable() {
    const wrap = document.getElementById("members-table-wrap");
    if (allPersons.length === 0) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">☰</div>Chưa có thành viên nào. Nhấn "Thêm thành viên" để bắt đầu.</div>`;
        return;
    }
    wrap.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Họ tên</th><th>Giới tính</th><th>Đời</th><th>Năm sinh</th><th>Trạng thái</th></tr></thead>
            <tbody>
                ${allPersons.map(p => `
                    <tr onclick="openDetail(${p.id})">
                        <td>
                            <div class="member-name-cell">
                                ${renderAvatarHtml(p.full_name, p.avatar_path)}
                                <div>
                                    <strong>${escapeHtml(p.full_name)}</strong>${p.nickname ? ` <span style="color:var(--color-ink-soft)">(${escapeHtml(p.nickname)})</span>` : ""}
                                </div>
                            </div>
                        </td>
                        <td>${genderLabel(p.gender)}</td>
                        <td>${p.generation ?? "—"}</td>
                        <td>${formatYear(p.birth_date)}</td>
                        <td><span class="status-dot ${p.is_alive ? "alive" : "deceased"}"></span>${p.is_alive ? "Còn sống" : "Đã mất"}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

document.getElementById("search-input").addEventListener("input", (e) => {
    loadMembers(e.target.value);
});

// ============================================================
// MODAL: THÊM / SỬA THÀNH VIÊN
// ============================================================
const personModal = document.getElementById("person-modal");
let editingPersonAvatarPath = null;

function openPersonModal(person) {
    document.getElementById("person-form").reset();
    document.getElementById("person-id").value = "";
    document.getElementById("person-modal-title").textContent = person ? "Sửa thông tin thành viên" : "Thêm thành viên";
    editingPersonAvatarPath = null;

    const avatarSection = document.getElementById("person-avatar-section");
    if (person) {
        document.getElementById("person-id").value = person.id;
        document.getElementById("f-full_name").value = person.full_name || "";
        document.getElementById("f-nickname").value = person.nickname || "";
        document.getElementById("f-gender").value = person.gender || "other";
        document.getElementById("f-birth_date").value = person.birth_date || "";
        document.getElementById("f-birth_date_note").value = person.birth_date_note || "";
        document.getElementById("f-is_alive").value = String(person.is_alive ?? 1);
        document.getElementById("f-death_date").value = person.death_date || "";
        document.getElementById("f-birth_place").value = person.birth_place || "";
        document.getElementById("f-generation").value = person.generation ?? "";
        document.getElementById("f-occupation").value = person.occupation || "";
        document.getElementById("f-biography").value = person.biography || "";
        editingPersonAvatarPath = person.avatar_path || null;
        avatarSection.style.display = "flex";
        setAvatarElement(
            document.getElementById("person-modal-avatar"),
            person.full_name,
            person.avatar_path,
            avatarInitials(person.full_name)
        );
    } else {
        avatarSection.style.display = "none";
    }
    personModal.classList.add("open");
}

function closePersonModal() {
    personModal.classList.remove("open");
}

document.getElementById("btn-add-person").addEventListener("click", () => openPersonModal(null));
document.getElementById("btn-cancel-person").addEventListener("click", closePersonModal);

document.getElementById("btn-change-person-avatar").addEventListener("click", () => {
    document.getElementById("person-avatar-input").click();
});

document.getElementById("person-avatar-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    const personId = document.getElementById("person-id").value;
    if (!file || !personId) return;
    try {
        const result = await apiUpload(`/persons/${personId}/avatar`, file);
        editingPersonAvatarPath = result.avatar_path;
        const name = document.getElementById("f-full_name").value;
        setAvatarElement(
            document.getElementById("person-modal-avatar"),
            name,
            result.avatar_path,
            avatarInitials(name)
        );
        await loadMembers(document.getElementById("search-input").value);
    } catch (err) {
        alert(err.message);
    }
});

document.getElementById("btn-remove-person-avatar").addEventListener("click", async () => {
    const personId = document.getElementById("person-id").value;
    if (!personId || !editingPersonAvatarPath) return;
    if (!confirm("Xóa ảnh đại diện của thành viên này?")) return;
    try {
        await apiDelete(`/persons/${personId}/avatar`);
        editingPersonAvatarPath = null;
        const name = document.getElementById("f-full_name").value;
        setAvatarElement(
            document.getElementById("person-modal-avatar"),
            name,
            null,
            avatarInitials(name)
        );
        await loadMembers(document.getElementById("search-input").value);
    } catch (err) {
        alert(err.message);
    }
});

document.getElementById("person-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("person-id").value;
    const payload = {
        full_name: document.getElementById("f-full_name").value,
        nickname: document.getElementById("f-nickname").value || null,
        gender: document.getElementById("f-gender").value,
        birth_date: document.getElementById("f-birth_date").value || null,
        birth_date_note: document.getElementById("f-birth_date_note").value || null,
        is_alive: parseInt(document.getElementById("f-is_alive").value),
        death_date: document.getElementById("f-death_date").value || null,
        birth_place: document.getElementById("f-birth_place").value || null,
        generation: document.getElementById("f-generation").value ? parseInt(document.getElementById("f-generation").value) : null,
        occupation: document.getElementById("f-occupation").value || null,
        biography: document.getElementById("f-biography").value || null,
    };

    if (id) {
        await apiSend(`/persons/${id}`, "PUT", payload);
    } else {
        await apiSend("/persons", "POST", payload);
    }
    closePersonModal();
    await loadMembers();
    if (currentDetailId) openDetail(currentDetailId);
});

// ============================================================
// TAB: CHI TIẾT THÀNH VIÊN
// ============================================================
async function openDetail(id) {
    currentDetailId = id;
    const person = await apiGet(`/persons/${id}`);

    document.querySelectorAll(".tab-content").forEach(el => (el.style.display = "none"));
    document.getElementById("tab-detail").style.display = "block";
    document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));

    document.getElementById("detail-name").textContent = person.full_name;
    document.getElementById("detail-subtitle").textContent =
        `${genderLabel(person.gender)} · ${person.is_alive ? "Còn sống" : "Đã mất"}` +
        (person.generation != null ? ` · Đời ${person.generation}` : "");

    const content = document.getElementById("detail-content");
    content.innerHTML = `
        <div class="detail-header-row">
            <div class="detail-avatar-wrap">
                ${renderAvatarHtml(person.full_name, person.avatar_path, "avatar-lg")}
            </div>
            <div class="avatar-upload-actions">
                <p class="avatar-hint">Ảnh đại diện thành viên</p>
                <input type="file" id="detail-avatar-input" accept="image/jpeg,image/png,image/webp,image/gif" hidden />
                <button type="button" class="btn-secondary btn" id="btn-detail-change-avatar">Đổi ảnh</button>
                <button type="button" class="btn-secondary btn" id="btn-detail-remove-avatar" ${person.avatar_path ? "" : "disabled"}>Xóa ảnh</button>
            </div>
        </div>
        <div class="detail-grid">
            <div class="card">
                <h3 class="card-title">Thông tin cá nhân</h3>
                <p><strong>Ngày sinh:</strong> ${person.birth_date || "chưa rõ"} ${person.birth_date_note ? `(${escapeHtml(person.birth_date_note)})` : ""}</p>
                <p><strong>Nơi sinh:</strong> ${escapeHtml(person.birth_place) || "—"}</p>
                <p><strong>Nghề nghiệp:</strong> ${escapeHtml(person.occupation) || "—"}</p>
                ${!person.is_alive ? `<p><strong>Ngày mất:</strong> ${person.death_date || "chưa rõ"} ${person.death_date_note ? `(${escapeHtml(person.death_date_note)})` : ""}</p>` : ""}
                <p><strong>Tiểu sử:</strong><br>${escapeHtml(person.biography) || "—"}</p>
            </div>
            <div class="card">
                <h3 class="card-title">Cha / Mẹ</h3>
                <ul class="relation-list">
                    ${person.parents.map(p => `<li>${escapeHtml(p.full_name)}</li>`).join("") || "<li>Chưa có thông tin</li>"}
                </ul>
                <button class="btn-secondary btn" style="margin-top:10px;width:100%" onclick="openRelationModal('parent')">+ Thêm cha/mẹ</button>

                <h3 class="card-title" style="margin-top:18px">Vợ / Chồng</h3>
                <ul class="relation-list">
                    ${person.spouses.map(s => `<li>${escapeHtml(s.full_name)} <span style="color:var(--color-ink-soft)">(${s.status === "married" ? "đang kết hôn" : s.status === "divorced" ? "đã ly hôn" : "góa"})</span></li>`).join("") || "<li>Chưa có thông tin</li>"}
                </ul>
                <button class="btn-secondary btn" style="margin-top:10px;width:100%" onclick="openRelationModal('spouse')">+ Thêm vợ/chồng</button>
            </div>
            <div class="card">
                <h3 class="card-title">Con cái</h3>
                <ul class="relation-list">
                    ${person.children.map(c => `<li>${escapeHtml(c.full_name)}</li>`).join("") || "<li>Chưa có thông tin</li>"}
                </ul>
                <button class="btn-secondary btn" style="margin-top:10px;width:100%" onclick="openRelationModal('child')">+ Thêm con</button>
            </div>
        </div>
        <div class="card">
            <h3 class="card-title">Vùng nguy hiểm</h3>
            <button class="btn btn-danger" onclick="deletePerson(${person.id})">Xóa thành viên này</button>
        </div>
    `;

    document.getElementById("btn-detail-change-avatar").addEventListener("click", () => {
        document.getElementById("detail-avatar-input").click();
    });
    document.getElementById("detail-avatar-input").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        try {
            await apiUpload(`/persons/${id}/avatar`, file);
            openDetail(id);
            await loadMembers(document.getElementById("search-input").value);
        } catch (err) {
            alert(err.message);
        }
    });
    document.getElementById("btn-detail-remove-avatar").addEventListener("click", async () => {
        if (!person.avatar_path) return;
        if (!confirm("Xóa ảnh đại diện của thành viên này?")) return;
        try {
            await apiDelete(`/persons/${id}/avatar`);
            openDetail(id);
            await loadMembers(document.getElementById("search-input").value);
        } catch (err) {
            alert(err.message);
        }
    });
}

document.getElementById("btn-back-members").addEventListener("click", () => showTab("members"));
document.getElementById("btn-edit-person").addEventListener("click", async () => {
    const person = await apiGet(`/persons/${currentDetailId}`);
    openPersonModal(person);
});

async function deletePerson(id) {
    if (!confirm("Bạn có chắc muốn xóa thành viên này? Hành động này không thể hoàn tác.")) return;
    await apiSend(`/persons/${id}`, "DELETE");
    showTab("members");
}

// ============================================================
// MODAL: THÊM QUAN HỆ (cha/mẹ, con, vợ/chồng)
// ============================================================
const relationModal = document.getElementById("relation-modal");
let relationMode = "child";

async function openRelationModal(mode) {
    relationMode = mode;
    document.getElementById("r-type").value = mode;
    const select = document.getElementById("r-other_person");
    const persons = await apiGet("/persons");
    select.innerHTML = persons
        .filter(p => p.id !== currentDetailId)
        .map(p => `<option value="${p.id}">${p.full_name}</option>`)
        .join("");
    relationModal.classList.add("open");
}

document.getElementById("r-type").addEventListener("change", (e) => (relationMode = e.target.value));
document.getElementById("btn-cancel-relation").addEventListener("click", () => relationModal.classList.remove("open"));

document.getElementById("relation-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const otherId = parseInt(document.getElementById("r-other_person").value);

    if (relationMode === "child") {
        await apiSend("/relationships/parent-child", "POST", { parent_id: currentDetailId, child_id: otherId });
    } else if (relationMode === "parent") {
        await apiSend("/relationships/parent-child", "POST", { parent_id: otherId, child_id: currentDetailId });
    } else if (relationMode === "spouse") {
        await apiSend("/relationships/marriage", "POST", { person1_id: currentDetailId, person2_id: otherId });
    }
    relationModal.classList.remove("open");
    openDetail(currentDetailId);
});

// ============================================================
// TAB: SỰ KIỆN
// ============================================================
async function loadEvents() {
    const events = await apiGet("/events");
    const list = document.getElementById("events-list");
    if (events.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div>Chưa có sự kiện nào.</div>`;
        return;
    }
    list.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Người liên quan</th><th>Loại</th><th>Ngày</th><th>Lịch</th><th>Mô tả</th><th></th></tr></thead>
            <tbody>
                ${events.map(e => `
                    <tr>
                        <td>${e.full_name}</td>
                        <td>${eventTypeLabel(e.event_type)}</td>
                        <td>${e.event_date || "—"}</td>
                        <td>${e.calendar_type === "lunar" ? "Âm lịch" : "Dương lịch"}</td>
                        <td>${e.description || "—"}</td>
                        <td><button class="btn-secondary btn" onclick="deleteEvent(${e.id})">Xóa</button></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

async function deleteEvent(id) {
    if (!confirm("Xóa sự kiện này?")) return;
    await apiSend(`/events/${id}`, "DELETE");
    loadEvents();
}

const eventModal = document.getElementById("event-modal");
document.getElementById("btn-add-event").addEventListener("click", async () => {
    const persons = await apiGet("/persons");
    document.getElementById("e-person_id").innerHTML = persons.map(p => `<option value="${p.id}">${p.full_name}</option>`).join("");
    document.getElementById("event-form").reset();
    eventModal.classList.add("open");
});
document.getElementById("btn-cancel-event").addEventListener("click", () => eventModal.classList.remove("open"));

document.getElementById("event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await apiSend("/events", "POST", {
        person_id: parseInt(document.getElementById("e-person_id").value),
        event_type: document.getElementById("e-event_type").value,
        calendar_type: document.getElementById("e-calendar_type").value,
        event_date: document.getElementById("e-event_date").value || null,
        description: document.getElementById("e-description").value || null,
    });
    eventModal.classList.remove("open");
    loadEvents();
});

// ============================================================
// TAB: CÂY GIA PHẢ (vẽ bằng SVG thuần, không cần thư viện ngoài)
// ============================================================
const NODE_W = 175;
const NODE_H = 56;
const H_GAP = 30;
const V_GAP = 90;
const NODE_AVATAR_SIZE = 32;
const NODE_TEXT_X = 48;

async function loadTree() {
    const data = await apiGet("/tree");
    const persons = data.persons;

    const select = document.getElementById("tree-root-select");
    select.innerHTML = `<option value="">-- Chọn người làm gốc --</option>` +
        persons.map(p => `<option value="${p.id}">${p.full_name}</option>`).join("");

    drawTree(data, null);

    select.onchange = () => {
        const rootId = select.value ? parseInt(select.value) : null;
        drawTree(data, rootId);
    };
}

document.getElementById("btn-tree-reset").addEventListener("click", () => {
    document.getElementById("tree-root-select").value = "";
    loadTree();
});

function drawTree(data, rootId) {
    const { persons, parent_child, marriages } = data;
    const byId = Object.fromEntries(persons.map(p => [p.id, p]));

    // B1: Xây map con cái theo từng cha/mẹ
    const childrenOf = {}; // parent_id -> [child_id,...]
    parent_child.forEach(link => {
        if (!childrenOf[link.parent_id]) childrenOf[link.parent_id] = [];
        childrenOf[link.parent_id].push(link.child_id);
    });
    const parentsOf = {}; // child_id -> [parent_id,...]
    parent_child.forEach(link => {
        if (!parentsOf[link.child_id]) parentsOf[link.child_id] = [];
        parentsOf[link.child_id].push(link.parent_id);
    });

    // B2: Xác định tập hợp người sẽ hiển thị (toàn bộ, hoặc chỉ hậu duệ của rootId)
    let visibleIds = new Set(persons.map(p => p.id));
    if (rootId) {
        visibleIds = new Set();
        const queue = [rootId];
        while (queue.length) {
            const cur = queue.shift();
            if (visibleIds.has(cur)) continue;
            visibleIds.add(cur);
            (childrenOf[cur] || []).forEach(c => queue.push(c));
        }
    }

    // B3: Tính "đời" (generation) cho từng người bằng cách lan truyền từ người không có cha/mẹ
    const generation = {};
    const noParent = persons.filter(p => !parentsOf[p.id] || parentsOf[p.id].length === 0);
    noParent.forEach(p => (generation[p.id] = p.generation ?? 0));

    let changed = true;
    let safety = 0;
    while (changed && safety < 50) {
        changed = false;
        safety++;
        parent_child.forEach(link => {
            if (generation[link.parent_id] != null) {
                const g = generation[link.parent_id] + 1;
                if (generation[link.child_id] == null || generation[link.child_id] < g) {
                    generation[link.child_id] = g;
                    changed = true;
                }
            }
        });
    }
    // Người còn lại chưa có generation (mồ côi dữ liệu) -> gán 0
    persons.forEach(p => { if (generation[p.id] == null) generation[p.id] = p.generation ?? 0; });

    // B4: Nhóm theo generation, chỉ lấy người visible
    const rows = {};
    persons.filter(p => visibleIds.has(p.id)).forEach(p => {
        const g = generation[p.id];
        if (!rows[g]) rows[g] = [];
        rows[g].push(p.id);
    });
    const genLevels = Object.keys(rows).map(Number).sort((a, b) => a - b);

    // B5: Gán tọa độ x ban đầu theo thứ tự, rồi tinh chỉnh theo vị trí trung bình của cha/mẹ
    const posX = {};
    genLevels.forEach(g => {
        rows[g].sort((a, b) => byId[a].full_name.localeCompare(byId[b].full_name));
        rows[g].forEach((id, idx) => { posX[id] = idx * (NODE_W + H_GAP); });
    });
    // Tinh chỉnh 2 lượt: đặt lại theo trung bình x của cha/mẹ để cây gọn hơn
    for (let pass = 0; pass < 2; pass++) {
        genLevels.forEach(g => {
            rows[g].forEach(id => {
                const parents = (parentsOf[id] || []).filter(pid => posX[pid] != null);
                if (parents.length > 0) {
                    const avg = parents.reduce((s, pid) => s + posX[pid], 0) / parents.length;
                    posX[id] = avg;
                }
            });
            // Tránh chồng lấn: sắp lại theo posX rồi ép khoảng cách tối thiểu
            rows[g].sort((a, b) => posX[a] - posX[b]);
            rows[g].forEach((id, idx) => {
                if (idx === 0) return;
                const prevId = rows[g][idx - 1];
                const minX = posX[prevId] + NODE_W + H_GAP;
                if (posX[id] < minX) posX[id] = minX;
            });
        });
    }

    // Bù cho tọa độ âm (nếu có) để toàn bộ cây nằm trong vùng dương
    const minPosX = Math.min(...Object.values(posX));
    if (minPosX < 0) Object.keys(posX).forEach(id => (posX[id] -= minPosX));

    const maxX = Math.max(...Object.values(posX)) + NODE_W + 60;
    const maxY = (genLevels.length + 1) * V_GAP + 60;

    // B6: Dựng SVG
    let svgDefs = "<defs>";
    persons.filter(p => visibleIds.has(p.id) && p.avatar_path).forEach(p => {
        svgDefs += `<clipPath id="clip-${p.id}"><circle cx="0" cy="0" r="${NODE_AVATAR_SIZE / 2}" /></clipPath>`;
    });
    svgDefs += "</defs>";

    let svg = `<svg width="${maxX}" height="${maxY}" xmlns="http://www.w3.org/2000/svg">${svgDefs}`;

    // Vẽ đường nối cha/mẹ -> con trước (để nằm dưới các thẻ)
    parent_child.forEach(link => {
        if (!visibleIds.has(link.parent_id) || !visibleIds.has(link.child_id)) return;
        const px = posX[link.parent_id] + NODE_W / 2;
        const py = generation[link.parent_id] * V_GAP + 60 + NODE_H;
        const cx = posX[link.child_id] + NODE_W / 2;
        const cy = generation[link.child_id] * V_GAP + 60;
        const midY = (py + cy) / 2;
        svg += `<path class="edge-line" d="M ${px} ${py} C ${px} ${midY}, ${cx} ${midY}, ${cx} ${cy}" />`;
    });

    // Vẽ đường nối vợ/chồng
    marriages.forEach(m => {
        if (!visibleIds.has(m.person1_id) || !visibleIds.has(m.person2_id)) return;
        const g1 = generation[m.person1_id], g2 = generation[m.person2_id];
        if (g1 !== g2) return; // chỉ nối nếu cùng hàng (trường hợp thường gặp)
        const x1 = posX[m.person1_id] + NODE_W;
        const x2 = posX[m.person2_id];
        const y = g1 * V_GAP + 60 + NODE_H / 2;
        if (x2 > x1) {
            svg += `<line class="marriage-line" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" />`;
        }
    });

    // Vẽ từng thẻ người
    persons.filter(p => visibleIds.has(p.id)).forEach(p => {
        const x = posX[p.id];
        const y = generation[p.id] * V_GAP + 60;
        const genderClass = p.gender === "male" ? "male" : p.gender === "female" ? "female" : "";
        const avatarX = x + 8 + NODE_AVATAR_SIZE / 2;
        const avatarY = y + 12 + NODE_AVATAR_SIZE / 2;
        let avatarSvg;
        if (p.avatar_path) {
            avatarSvg = `
                <g transform="translate(${avatarX}, ${avatarY})">
                    <image href="/uploads/${p.avatar_path}" x="${-NODE_AVATAR_SIZE / 2}" y="${-NODE_AVATAR_SIZE / 2}"
                        width="${NODE_AVATAR_SIZE}" height="${NODE_AVATAR_SIZE}" clip-path="url(#clip-${p.id})"
                        preserveAspectRatio="xMidYMid slice" />
                </g>`;
        } else {
            avatarSvg = `
                <circle class="node-avatar-bg" cx="${avatarX}" cy="${avatarY}" r="${NODE_AVATAR_SIZE / 2}" />
                <text class="node-avatar-text" x="${avatarX}" y="${avatarY}">${escapeHtml(avatarInitials(p.full_name))}</text>`;
        }
        svg += `
            <g class="tree-node-card" onclick="openDetailFromTree(${p.id})">
                <rect class="card-bg ${genderClass}" x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="6" />
                ${avatarSvg}
                <text class="node-name" x="${x + NODE_TEXT_X}" y="${y + 22}">${escapeHtml(truncate(p.full_name, 16))}</text>
                <text class="node-years" x="${x + NODE_TEXT_X}" y="${y + 40}">${formatYear(p.birth_date)} - ${p.is_alive ? "nay" : formatYear(p.death_date)}</text>
                <g class="gen-badge" transform="translate(${x + NODE_W - 20}, ${y + 14})">
                    <circle r="11" />
                    <text x="0" y="4" text-anchor="middle">${generation[p.id]}</text>
                </g>
            </g>
        `;
    });

    svg += `</svg>`;

    const wrap = document.getElementById("tree-canvas-wrap");
    if (persons.filter(p => visibleIds.has(p.id)).length === 0) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⌂</div>Chưa có dữ liệu để vẽ cây gia phả. Hãy thêm thành viên và thiết lập quan hệ trước.</div>`;
    } else {
        wrap.innerHTML = svg;
    }
}

function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function openDetailFromTree(id) {
    openDetail(id);
}

// ============================================================
// KHỞI ĐỘNG: tải tab mặc định khi mở ứng dụng
// ============================================================
loadFamilyAvatar().then(() => showTab("dashboard"));
