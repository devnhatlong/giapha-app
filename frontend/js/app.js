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
let detailReturnTab = "members";
let membersPage = 1;
const MEMBERS_PAGE_SIZE = 10;

const DETAIL_RETURN_LABELS = {
    members: "← Quay lại danh sách",
    tree: "← Quay lại cây gia phả",
    dashboard: "← Quay lại tổng quan",
    events: "← Quay lại sự kiện",
};

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
        showToast("Đã cập nhật ảnh gia phả", "success");
    } catch (err) {
        showToast(err.message, "error");
    }
});

document.getElementById("btn-remove-family-avatar").addEventListener("click", async () => {
    const ok = await showConfirm({
        title: "Xóa ảnh gia phả",
        message: "Bạn có chắc muốn xóa ảnh đại diện gia phả?",
        confirmText: "Xóa",
        danger: true,
    });
    if (!ok) return;
    try {
        await apiDelete("/settings/family-avatar");
        updateFamilyAvatarUI(null);
        showToast("Đã xóa ảnh gia phả", "success");
    } catch (err) {
        showToast(err.message, "error");
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

function goToMembersPage(page) {
    const totalPages = Math.max(1, Math.ceil(allPersons.length / MEMBERS_PAGE_SIZE));
    membersPage = Math.max(1, Math.min(page, totalPages));
    renderMembersTable();
}

function renderMembersPagination(total, totalPages) {
    if (totalPages <= 1) return "";
    const start = (membersPage - 1) * MEMBERS_PAGE_SIZE + 1;
    const end = Math.min(membersPage * MEMBERS_PAGE_SIZE, total);
    return `
        <div class="pagination">
            <span class="pagination-info">Hiển thị ${start}–${end} / ${total} thành viên</span>
            <div class="pagination-controls">
                <button type="button" class="pagination-btn" ${membersPage <= 1 ? "disabled" : ""} onclick="goToMembersPage(${membersPage - 1})">← Trước</button>
                <span class="pagination-pages">Trang ${membersPage} / ${totalPages}</span>
                <button type="button" class="pagination-btn" ${membersPage >= totalPages ? "disabled" : ""} onclick="goToMembersPage(${membersPage + 1})">Sau →</button>
            </div>
        </div>
    `;
}

function renderMembersTable() {
    const wrap = document.getElementById("members-table-wrap");
    if (allPersons.length === 0) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">☰</div>Chưa có thành viên nào. Nhấn "Thêm thành viên" để bắt đầu.</div>`;
        return;
    }

    const total = allPersons.length;
    const totalPages = Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE));
    if (membersPage > totalPages) membersPage = totalPages;
    const startIdx = (membersPage - 1) * MEMBERS_PAGE_SIZE;
    const pageItems = allPersons.slice(startIdx, startIdx + MEMBERS_PAGE_SIZE);

    wrap.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Họ tên</th><th>Giới tính</th><th>Đời</th><th>Năm sinh</th><th>Trạng thái</th></tr></thead>
            <tbody>
                ${pageItems.map(p => `
                    <tr onclick="openDetail(${p.id}, 'members')">
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
        ${renderMembersPagination(total, totalPages)}
    `;
}

document.getElementById("search-input").addEventListener("input", (e) => {
    membersPage = 1;
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
    SearchSelect.refresh(document.getElementById("f-gender"));
    SearchSelect.refresh(document.getElementById("f-is_alive"));
    personModal.classList.add("open");
}

function closePersonModal() {
    SearchSelect.closeAll();
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
        showToast(err.message, "error");
    }
});

document.getElementById("btn-remove-person-avatar").addEventListener("click", async () => {
    const personId = document.getElementById("person-id").value;
    if (!personId || !editingPersonAvatarPath) return;
    const ok = await showConfirm({
        title: "Xóa ảnh đại diện",
        message: "Xóa ảnh đại diện của thành viên này?",
        confirmText: "Xóa",
        danger: true,
    });
    if (!ok) return;
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
        showToast("Đã xóa ảnh đại diện", "success");
    } catch (err) {
        showToast(err.message, "error");
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

    try {
        if (id) {
            await apiSend(`/persons/${id}`, "PUT", payload);
            showToast("Đã lưu thông tin thành viên", "success");
        } else {
            await apiSend("/persons", "POST", payload);
            showToast("Đã thêm thành viên mới", "success");
        }
        closePersonModal();
        await loadMembers();
        if (currentDetailId) openDetail(currentDetailId);
    } catch (err) {
        showToast(err.message, "error");
    }
});

// ============================================================
// TAB: CHI TIẾT THÀNH VIÊN
// ============================================================
function updateDetailBackButton() {
    const btn = document.getElementById("btn-back-members");
    btn.textContent = DETAIL_RETURN_LABELS[detailReturnTab] || "← Quay lại";
}

async function openDetail(id, returnTab) {
    if (returnTab) detailReturnTab = returnTab;
    currentDetailId = id;
    const person = await apiGet(`/persons/${id}`);

    document.querySelectorAll(".tab-content").forEach(el => (el.style.display = "none"));
    document.getElementById("tab-detail").style.display = "block";
    document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
    updateDetailBackButton();

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
                    ${person.parents.length
                        ? person.parents.map(p => `
                            <li>
                                <span class="relation-name">${escapeHtml(p.full_name)}</span>
                                <button type="button" class="relation-remove" title="Xóa liên kết" onclick="removeParentChildLink(${p.id}, ${person.id})">✕</button>
                            </li>`).join("")
                        : "<li class='relation-empty'>Chưa có thông tin</li>"}
                </ul>
                <button class="btn-secondary btn" style="margin-top:10px;width:100%" onclick="openRelationModal('parent')">+ Thêm cha/mẹ</button>

                <h3 class="card-title" style="margin-top:18px">Vợ / Chồng</h3>
                <ul class="relation-list">
                    ${person.spouses.length
                        ? person.spouses.map(s => `
                            <li>
                                <span class="relation-name">${escapeHtml(s.full_name)} <span class="relation-status">(${s.status === "married" ? "đang kết hôn" : s.status === "divorced" ? "đã ly hôn" : "góa"})</span></span>
                                <button type="button" class="relation-remove" title="Xóa liên kết" onclick="removeMarriageLink(${s.marriage_id})">✕</button>
                            </li>`).join("")
                        : "<li class='relation-empty'>Chưa có thông tin</li>"}
                </ul>
                <button class="btn-secondary btn" style="margin-top:10px;width:100%" onclick="openRelationModal('spouse')">+ Thêm vợ/chồng</button>
            </div>
            <div class="card">
                <h3 class="card-title">Con cái</h3>
                <ul class="relation-list">
                    ${person.children.length
                        ? person.children.map(c => `
                            <li>
                                <span class="relation-name">${escapeHtml(c.full_name)}</span>
                                <button type="button" class="relation-remove" title="Xóa liên kết" onclick="removeParentChildLink(${person.id}, ${c.id})">✕</button>
                            </li>`).join("")
                        : "<li class='relation-empty'>Chưa có thông tin</li>"}
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
            showToast("Đã cập nhật ảnh đại diện", "success");
        } catch (err) {
            showToast(err.message, "error");
        }
    });
    document.getElementById("btn-detail-remove-avatar").addEventListener("click", async () => {
        if (!person.avatar_path) return;
        const ok = await showConfirm({
            title: "Xóa ảnh đại diện",
            message: "Xóa ảnh đại diện của thành viên này?",
            confirmText: "Xóa",
            danger: true,
        });
        if (!ok) return;
        try {
            await apiDelete(`/persons/${id}/avatar`);
            openDetail(id);
            await loadMembers(document.getElementById("search-input").value);
            showToast("Đã xóa ảnh đại diện", "success");
        } catch (err) {
            showToast(err.message, "error");
        }
    });
}

document.getElementById("btn-back-members").addEventListener("click", () => showTab(detailReturnTab));
document.getElementById("btn-edit-person").addEventListener("click", async () => {
    const person = await apiGet(`/persons/${currentDetailId}`);
    openPersonModal(person);
});

async function deletePerson(id) {
    const ok = await showConfirm({
        title: "Xóa thành viên",
        message: "Bạn có chắc muốn xóa thành viên này? Hành động này không thể hoàn tác.",
        confirmText: "Xóa",
        danger: true,
    });
    if (!ok) return;
    await apiSend(`/persons/${id}`, "DELETE");
    showToast("Đã xóa thành viên", "success");
    showTab("members");
}

async function removeParentChildLink(parentId, childId) {
    const ok = await showConfirm({
        title: "Xóa liên kết",
        message: "Xóa liên kết cha/mẹ – con này? Hai thành viên vẫn được giữ lại.",
        confirmText: "Xóa liên kết",
        danger: true,
    });
    if (!ok) return;
    try {
        await apiDelete(`/relationships/parent-child?parent_id=${parentId}&child_id=${childId}`);
        showToast("Đã xóa liên kết", "success");
        openDetail(currentDetailId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function removeMarriageLink(marriageId) {
    const ok = await showConfirm({
        title: "Xóa liên kết",
        message: "Xóa liên kết hôn nhân này? Hai thành viên vẫn được giữ lại.",
        confirmText: "Xóa liên kết",
        danger: true,
    });
    if (!ok) return;
    try {
        await apiDelete(`/relationships/marriage/${marriageId}`);
        showToast("Đã xóa liên kết hôn nhân", "success");
        openDetail(currentDetailId);
    } catch (err) {
        showToast(err.message, "error");
    }
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
    const filtered = persons.filter(p => p.id !== currentDetailId);
    select.innerHTML = filtered.length
        ? filtered.map(p => `<option value="${p.id}">${escapeHtml(p.full_name)}</option>`).join("")
        : `<option value="" disabled>Chưa có người khác để chọn</option>`;
    SearchSelect.refresh(document.getElementById("r-type"));
    SearchSelect.refresh(select);
    SearchSelect.closeAll();
    relationModal.classList.add("open");
}

document.getElementById("r-type").addEventListener("change", (e) => (relationMode = e.target.value));
document.getElementById("btn-cancel-relation").addEventListener("click", () => {
    SearchSelect.closeAll();
    relationModal.classList.remove("open");
});

document.getElementById("relation-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const otherId = parseInt(document.getElementById("r-other_person").value);
    if (!otherId) {
        showToast("Vui lòng chọn một thành viên.", "info");
        return;
    }

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
    const ok = await showConfirm({
        title: "Xóa sự kiện",
        message: "Xóa sự kiện này?",
        confirmText: "Xóa",
        danger: true,
    });
    if (!ok) return;
    await apiSend(`/events/${id}`, "DELETE");
    showToast("Đã xóa sự kiện", "success");
    loadEvents();
}

const eventModal = document.getElementById("event-modal");
document.getElementById("btn-add-event").addEventListener("click", async () => {
    const persons = await apiGet("/persons");
    const sel = document.getElementById("e-person_id");
    sel.innerHTML = persons.map(p => `<option value="${p.id}">${escapeHtml(p.full_name)}</option>`).join("");
    document.getElementById("event-form").reset();
    SearchSelect.refresh(sel);
    SearchSelect.closeAll();
    eventModal.classList.add("open");
});
document.getElementById("btn-cancel-event").addEventListener("click", () => {
    SearchSelect.closeAll();
    eventModal.classList.remove("open");
});

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
const NODE_W = 190;
const NODE_H = 68;
const H_GAP = 46;
const V_GAP = 120;
const NODE_TOP = 40;
const NODE_AVATAR_R = 20;
const NODE_AVATAR_CX = 34;
const NODE_TEXT_X = 64;

function treeGenderColor(gender) {
    if (gender === "male") return "#4A6B87";
    if (gender === "female") return "#A65275";
    return "#8A7F6B";
}

function treeAvatarInitial(name) {
    const parts = name.trim().split(/\s+/);
    return (parts[parts.length - 1]?.[0] || "?").toUpperCase();
}

function formatTreeYears(p) {
    const end = p.is_alive ? "nay" : formatYear(p.death_date);
    return `${formatYear(p.birth_date)} — ${end}`;
}

function treeNodeCenterX(id, posX, offsetX) {
    return posX[id] + offsetX + NODE_W / 2;
}

function treeAreMarried(a, b, marriages) {
    return marriages.some(
        (m) => (m.person1_id === a && m.person2_id === b) || (m.person1_id === b && m.person2_id === a)
    );
}

function treeBuildSpouseMap(marriages, visibleIds) {
    const map = {};
    marriages.forEach((m) => {
        if (!visibleIds.has(m.person1_id) || !visibleIds.has(m.person2_id)) return;
        map[m.person1_id] = m.person2_id;
        map[m.person2_id] = m.person1_id;
    });
    return map;
}

function treeResolveFamilyUnit(parentIds, spouseMap, visibleIds) {
    for (const p of parentIds) {
        const sp = spouseMap[p];
        if (sp && visibleIds.has(sp)) {
            return { type: "couple", ids: [Math.min(p, sp), Math.max(p, sp)] };
        }
    }
    if (parentIds.length === 1) {
        const sp = spouseMap[parentIds[0]];
        if (sp && visibleIds.has(sp)) {
            const p = parentIds[0];
            return { type: "couple", ids: [Math.min(p, sp), Math.max(p, sp)] };
        }
        return { type: "single", ids: [parentIds[0]] };
    }
    return { type: "multi", ids: [...parentIds].sort((a, b) => a - b) };
}

/** Gom con theo đơn vị gia đình (vợ chồng = một nhóm con chung). */
function treeBuildFamilyGroups(persons, parentsOf, marriages, visibleIds, generation) {
    const spouseMap = treeBuildSpouseMap(marriages, visibleIds);
    const groups = new Map();

    persons.filter((p) => visibleIds.has(p.id)).forEach((child) => {
        let parentIds = (parentsOf[child.id] || []).filter((pid) => visibleIds.has(pid));
        parentIds = parentIds.filter(
            (pid) =>
                !treeAreMarried(pid, child.id, marriages) &&
                generation[child.id] === generation[pid] + 1
        );
        if (parentIds.length === 0) return;

        const unit = treeResolveFamilyUnit(parentIds, spouseMap, visibleIds);
        let key;
        if (unit.type === "couple") key = `c-${unit.ids[0]}-${unit.ids[1]}`;
        else if (unit.type === "single") key = `p-${unit.ids[0]}`;
        else key = `m-${unit.ids.join("-")}`;

        if (!groups.has(key)) groups.set(key, { unit, childIds: [] });
        groups.get(key).childIds.push(child.id);
    });

    return groups;
}

function treeFamilyAnchorX(unit, posX, offsetX, marriages) {
    if (unit.type === "couple") {
        return (treeNodeCenterX(unit.ids[0], posX, offsetX) + treeNodeCenterX(unit.ids[1], posX, offsetX)) / 2;
    }
    return unit.ids.reduce((s, pid) => s + treeNodeCenterX(pid, posX, offsetX), 0) / unit.ids.length;
}

function treeFamilyParentY(unit, generation) {
    if (unit.type === "couple") {
        return generation[unit.ids[0]] * V_GAP + NODE_TOP + NODE_H;
    }
    return Math.max(...unit.ids.map((pid) => generation[pid] * V_GAP + NODE_TOP + NODE_H));
}

function treeComputeGenerations(persons, parent_child, marriages, visibleIds, parentsOf) {
    const generation = {};
    persons
        .filter((p) => visibleIds.has(p.id) && (!parentsOf[p.id] || parentsOf[p.id].length === 0))
        .forEach((p) => (generation[p.id] = p.generation ?? 0));

    let changed = true;
    let safety = 0;
    while (changed && safety++ < 80) {
        changed = false;
        parent_child.forEach((link) => {
            if (!visibleIds.has(link.parent_id) || !visibleIds.has(link.child_id)) return;
            if (generation[link.parent_id] != null) {
                const g = generation[link.parent_id] + 1;
                if (generation[link.child_id] == null || generation[link.child_id] < g) {
                    generation[link.child_id] = g;
                    changed = true;
                }
            }
        });
        marriages.forEach((m) => {
            if (!visibleIds.has(m.person1_id) || !visibleIds.has(m.person2_id)) return;
            const g1 = generation[m.person1_id];
            const g2 = generation[m.person2_id];
            if (g1 != null && g2 != null && g1 !== g2) {
                const g = Math.min(g1, g2);
                generation[m.person1_id] = g;
                generation[m.person2_id] = g;
                changed = true;
            } else if (g1 != null && g2 == null) {
                generation[m.person2_id] = g1;
                changed = true;
            } else if (g2 != null && g1 == null) {
                generation[m.person1_id] = g2;
                changed = true;
            }
        });
    }
    persons.filter((p) => visibleIds.has(p.id)).forEach((p) => {
        if (generation[p.id] == null) generation[p.id] = p.generation ?? 0;
    });
    return generation;
}

function treeResolveRowCollisions(rowIds, posX) {
    rowIds.sort((a, b) => posX[a] - posX[b]);
    for (let i = 1; i < rowIds.length; i++) {
        const prevId = rowIds[i - 1];
        const curId = rowIds[i];
        const minX = posX[prevId] + NODE_W + H_GAP;
        if (posX[curId] < minX) posX[curId] = minX;
    }
}

function treeLayoutPositions(rows, genLevels, familyGroups, marriages, visibleIds, byId, generation, posX) {
    genLevels.forEach((g) => {
        const row = rows[g];
        const placed = new Set();
        const ordered = [];
        row.sort((a, b) => byId[a].full_name.localeCompare(byId[b].full_name));
        row.forEach((id) => {
            if (placed.has(id)) return;
            ordered.push(id);
            placed.add(id);
            const spouse = marriages.find(
                (m) =>
                    (m.person1_id === id && row.includes(m.person2_id)) ||
                    (m.person2_id === id && row.includes(m.person1_id))
            );
            if (spouse) {
                const sid = spouse.person1_id === id ? spouse.person2_id : spouse.person1_id;
                if (!placed.has(sid)) {
                    ordered.push(sid);
                    placed.add(sid);
                }
            }
        });
        ordered.forEach((id, idx) => {
            posX[id] = idx * (NODE_W + H_GAP);
        });
    });

    genLevels.forEach((g) => {
        if (g === 0) return;

        familyGroups.forEach(({ unit, childIds }) => {
            const childGen = generation[childIds[0]];
            if (childGen !== g) return;

            childIds.sort((a, b) => byId[a].full_name.localeCompare(byId[b].full_name));
            const anchorCenter = treeFamilyAnchorX(unit, posX, 0, marriages);
            const totalW = childIds.length * NODE_W + (childIds.length - 1) * H_GAP;
            let startX = anchorCenter - totalW / 2;
            childIds.forEach((id, i) => {
                posX[id] = startX + i * (NODE_W + H_GAP);
            });
        });

        treeResolveRowCollisions(rows[g], posX);
    });

    return posX;
}

function treeDrawConnectors(familyGroups, generation, posX, offsetX, visibleIds, marriages) {
    let out = "";
    const drawnMarriages = new Set();

    const drawMarriageLine = (p1, p2) => {
        const mk = [p1, p2].sort((a, b) => a - b).join("-");
        if (drawnMarriages.has(mk)) return;
        drawnMarriages.add(mk);
        const leftId = posX[p1] < posX[p2] ? p1 : p2;
        const rightId = leftId === p1 ? p2 : p1;
        const x1 = posX[leftId] + offsetX + NODE_W;
        const x2 = posX[rightId] + offsetX;
        const y = generation[leftId] * V_GAP + NODE_TOP + NODE_H / 2;
        if (x2 > x1) {
            out += `<line class="marriage-line" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" />`;
            out += `<circle class="marriage-dot" cx="${(x1 + x2) / 2}" cy="${y}" r="6" />`;
        }
    };

    familyGroups.forEach(({ unit, childIds }) => {
        childIds.sort((a, b) => posX[a] - posX[b]);
        if (unit.type === "couple") drawMarriageLine(unit.ids[0], unit.ids[1]);

        const childCenters = childIds.map((id) => treeNodeCenterX(id, posX, offsetX));
        const childY = generation[childIds[0]] * V_GAP + NODE_TOP;
        const anchorX = treeFamilyAnchorX(unit, posX, offsetX, marriages);
        const parentY = treeFamilyParentY(unit, generation);
        const forkY = parentY + (childY - parentY) * 0.5;

        if (childIds.length === 1) {
            const cx = childCenters[0];
            out += `<path class="edge-line" d="M ${anchorX} ${parentY} L ${anchorX} ${forkY} L ${cx} ${forkY} L ${cx} ${childY}" />`;
        } else {
            const leftX = Math.min(...childCenters);
            const rightX = Math.max(...childCenters);
            out += `<path class="edge-line" d="M ${anchorX} ${parentY} L ${anchorX} ${forkY} L ${leftX} ${forkY} L ${rightX} ${forkY}" />`;
            childCenters.forEach((cx) => {
                out += `<path class="edge-line" d="M ${cx} ${forkY} L ${cx} ${childY}" />`;
            });
        }
    });

    marriages.forEach((m) => {
        if (!visibleIds.has(m.person1_id) || !visibleIds.has(m.person2_id)) return;
        if (generation[m.person1_id] !== generation[m.person2_id]) return;
        drawMarriageLine(m.person1_id, m.person2_id);
    });

    return out;
}

async function loadTree() {
    const data = await apiGet("/tree");
    const persons = data.persons;

    const select = document.getElementById("tree-root-select");
    select.innerHTML = `<option value="">-- Chọn người làm gốc --</option>` +
        persons.map(p => `<option value="${p.id}">${escapeHtml(p.full_name)}</option>`).join("");

    drawTree(data, null);
    SearchSelect.refresh(select);

    select.onchange = () => {
        const rootId = select.value ? parseInt(select.value) : null;
        drawTree(data, rootId);
    };
}

document.getElementById("btn-tree-reset").addEventListener("click", () => {
    const sel = document.getElementById("tree-root-select");
    sel.value = "";
    SearchSelect.refresh(sel);
    loadTree();
});

function drawTree(data, rootId) {
    const { persons, parent_child, marriages } = data;
    const byId = Object.fromEntries(persons.map((p) => [p.id, p]));

    const childrenOf = {};
    parent_child.forEach((link) => {
        if (!childrenOf[link.parent_id]) childrenOf[link.parent_id] = [];
        childrenOf[link.parent_id].push(link.child_id);
    });
    const parentsOf = {};
    parent_child.forEach((link) => {
        if (!parentsOf[link.child_id]) parentsOf[link.child_id] = [];
        parentsOf[link.child_id].push(link.parent_id);
    });

    let visibleIds = new Set(persons.map((p) => p.id));
    if (rootId) {
        visibleIds = new Set();
        const queue = [rootId];
        while (queue.length) {
            const cur = queue.shift();
            if (visibleIds.has(cur)) continue;
            visibleIds.add(cur);
            (childrenOf[cur] || []).forEach((c) => queue.push(c));
        }
    }

    const generation = treeComputeGenerations(persons, parent_child, marriages, visibleIds, parentsOf);

    const rows = {};
    persons.filter((p) => visibleIds.has(p.id)).forEach((p) => {
        const g = generation[p.id];
        if (!rows[g]) rows[g] = [];
        rows[g].push(p.id);
    });
    const genLevels = Object.keys(rows).map(Number).sort((a, b) => a - b);

    const familyGroups = treeBuildFamilyGroups(persons, parentsOf, marriages, visibleIds, generation);
    const posX = {};
    treeLayoutPositions(rows, genLevels, familyGroups, marriages, visibleIds, byId, generation, posX);

    const minPosX = Math.min(...Object.values(posX));
    Object.keys(posX).forEach((id) => {
        posX[id] -= minPosX;
    });

    const contentWidth = Math.max(...Object.values(posX)) + NODE_W;
    const canvasWidth = Math.max(contentWidth + 80, 900);
    const offsetX = (canvasWidth - contentWidth) / 2;
    const canvasHeight = genLevels.length * V_GAP + NODE_H + 60;

    let svgDefs = "<defs>";
    persons.filter((p) => visibleIds.has(p.id) && p.avatar_path).forEach((p) => {
        svgDefs += `<clipPath id="clip-${p.id}"><circle cx="0" cy="0" r="${NODE_AVATAR_R}" /></clipPath>`;
    });
    svgDefs += "</defs>";

    let svg = `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">${svgDefs}`;

    svg += treeDrawConnectors(familyGroups, generation, posX, offsetX, visibleIds, marriages);

    persons.filter(p => visibleIds.has(p.id)).forEach(p => {
        const x = posX[p.id] + offsetX;
        const y = generation[p.id] * V_GAP + NODE_TOP;
        const avatarCx = x + NODE_AVATAR_CX;
        const avatarCy = y + NODE_H / 2;
        const alive = p.is_alive === 1 || p.is_alive === true;
        const deceasedClass = alive ? "" : " deceased";
        const genderColor = treeGenderColor(p.gender);

        let avatarSvg;
        if (p.avatar_path) {
            avatarSvg = `
                <circle cx="${avatarCx}" cy="${avatarCy}" r="${NODE_AVATAR_R}" fill="${genderColor}" />
                <g transform="translate(${avatarCx}, ${avatarCy})">
                    <image href="/uploads/${p.avatar_path}" x="${-NODE_AVATAR_R}" y="${-NODE_AVATAR_R}"
                        width="${NODE_AVATAR_R * 2}" height="${NODE_AVATAR_R * 2}" clip-path="url(#clip-${p.id})"
                        preserveAspectRatio="xMidYMid slice" />
                </g>`;
        } else {
            avatarSvg = `
                <circle cx="${avatarCx}" cy="${avatarCy}" r="${NODE_AVATAR_R}" fill="${genderColor}" />
                <text class="node-avatar-letter" x="${avatarCx}" y="${avatarCy}">${escapeHtml(treeAvatarInitial(p.full_name))}</text>`;
        }

        svg += `
            <g class="tree-node-card${deceasedClass}" onclick="openDetailFromTree(${p.id})">
                <rect class="card-bg" x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8" />
                ${avatarSvg}
                <text class="node-name" x="${x + NODE_TEXT_X}" y="${y + 27}">${escapeHtml(truncate(p.full_name, 18))}</text>
                <text class="node-years" x="${x + NODE_TEXT_X}" y="${y + 45}">${formatTreeYears(p)}</text>
                <rect x="${x + NODE_W - 58}" y="${y + NODE_H - 22}" width="50" height="16" rx="8" fill="rgba(139,38,53,0.1)" />
                <text class="gen-label" x="${x + NODE_W - 33}" y="${y + NODE_H - 10}">Đời ${generation[p.id]}</text>
            </g>
        `;
    });

    svg += `</svg>`;

    const wrap = document.getElementById("tree-canvas-wrap");
    if (persons.filter(p => visibleIds.has(p.id)).length === 0) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⌂</div>Chưa có dữ liệu để vẽ cây gia phả. Hãy thêm thành viên và thiết lập quan hệ trước.</div>`;
    } else {
        wrap.innerHTML = `<div class="tree-svg-center" style="min-width:${canvasWidth}px">${svg}</div>`;
    }
}

function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function openDetailFromTree(id) {
    openDetail(id, "tree");
}

// ============================================================
// KHỞI ĐỘNG: tải tab mặc định khi mở ứng dụng
// ============================================================
loadFamilyAvatar().then(() => showTab("dashboard"));
