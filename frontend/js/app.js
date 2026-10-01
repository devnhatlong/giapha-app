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

   // Hiển thị ngày theo kiểu Việt Nam (ngày/tháng/năm) thay vì YYYY-MM-DD.
   // Chấp nhận "YYYY-MM-DD" (đủ ngày/tháng/năm) hoặc "MM-DD" (sự kiện lặp lại
   // hàng năm, không có năm) — chuỗi không đúng định dạng thì giữ nguyên.
   function formatDateVN(dateStr) {
       if (!dateStr) return "";
       const parts = dateStr.split("-");
       if (parts.length === 3 && parts.every((v) => /^\d+$/.test(v))) {
           const [y, m, d] = parts;
           return `${d}/${m}/${y}`;
       }
       if (parts.length === 2 && parts.every((v) => /^\d+$/.test(v))) {
           const [m, d] = parts;
           return `${d}/${m}`;
       }
       return dateStr;
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
   
   // Icon SVG lấy từ bộ <symbol> nhúng trong index.html
   function icon(name) {
       return `<svg class="icon"><use href="#i-${name}" /></svg>`;
   }

   function genderPill(g) {
       const cls = g === "male" ? "pill-male" : g === "female" ? "pill-female" : "";
       return `<span class="pill ${cls}">${genderLabel(g)}</span>`;
   }

   function statusPill(isAlive) {
       return isAlive
           ? `<span class="pill pill-alive"><span class="status-dot"></span>Còn sống</span>`
           : `<span class="pill pill-deceased"><span class="status-dot"></span>Đã mất</span>`;
   }

   function emptyStateHtml(iconName, message) {
       return `<div class="empty-state"><div class="empty-icon">${icon(iconName)}</div>${message}</div>`;
   }

   function renderAvatarHtml(name, avatarPath, sizeClass, gender) {
       let cls = sizeClass ? `avatar ${sizeClass}` : "avatar";
       if (gender === "male" || gender === "female") cls += ` avatar-${gender}`;
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
       const [stats, treeData] = await Promise.all([apiGet("/stats"), apiGet("/tree")]);
       const grid = document.getElementById("stats-grid");
       const statCard = (cls, iconName, value, label) => `
           <div class="stat-card ${cls}">
               <div class="stat-icon">${icon(iconName)}</div>
               <div><div class="stat-number">${value}</div><div class="stat-label">${label}</div></div>
           </div>`;
       grid.innerHTML =
           statCard("stat-total", "users", stats.total_members, "Tổng thành viên") +
           statCard("stat-alive", "alive", stats.alive, "Còn sống") +
           statCard("stat-deceased", "flame", stats.deceased, "Đã mất") +
           statCard("stat-generations", "layers", countRecordedGenerations(treeData), "Số đời đã ghi nhận");

       const events = await apiGet("/events");
       const wrap = document.getElementById("upcoming-events");
       if (events.length === 0) {
           wrap.innerHTML = emptyStateHtml("calendar", "Chưa có sự kiện nào được ghi nhận.");
       } else {
           // Backend đã sắp theo ngày sắp tới gần nhất -> chỉ hiện vài sự kiện gần nhất
           wrap.innerHTML = `<ul class="event-list">` + events.slice(0, 6).map(e => `
               <li class="event-item">
                   ${renderDateBadge(e.event_date)}
                   <div class="event-body">
                       <div class="event-name">${escapeHtml(e.full_name)}</div>
                       <div class="event-meta">
                           ${eventTypePill(e.event_type)}
                           <span>${formatDateVN(e.event_date) || "chưa rõ ngày"} · ${e.calendar_type === "lunar" ? "âm lịch" : "dương lịch"}</span>
                       </div>
                   </div>
               </li>
           `).join("") + `</ul>`;
       }
   }

   // Ô lịch nhỏ (tháng ở trên, ngày ở dưới) cho ngày dạng "MM-DD" hoặc "YYYY-MM-DD"
   function renderDateBadge(dateStr) {
       const parts = (dateStr || "").split("-");
       const valid = parts.length >= 2 && parts.every((v) => /^\d+$/.test(v));
       if (!valid) {
           return `<div class="date-badge unknown"><div class="date-badge-month">—</div><div class="date-badge-day">?</div></div>`;
       }
       const [m, d] = parts.slice(-2);
       return `<div class="date-badge" title="${formatDateVN(dateStr)}"><div class="date-badge-month">Th ${parseInt(m)}</div><div class="date-badge-day">${d}</div></div>`;
   }

   // Các loại sự kiện: nhãn, icon, màu (class pill-<value> trong style.css).
   // Thêm loại mới: thêm 1 dòng ở đây + <option> trong #e-event_type + nút lọc trong index.html.
   const EVENT_TYPES = {
       death_anniversary: { label: "Ngày giỗ", icon: "flame" },
       birthday: { label: "Sinh nhật", icon: "cake" },
       wedding: { label: "Ngày cưới", icon: "heart" },
       longevity: { label: "Mừng thọ", icon: "gift" },
       tomb_visit: { label: "Tảo mộ / Thanh minh", icon: "leaf" },
       clan_meeting: { label: "Giỗ tổ / Họp họ", icon: "users" },
       custom: { label: "Sự kiện khác", icon: "star" },
   };

   function eventTypePill(t) {
       const type = EVENT_TYPES[t] ? t : "custom";
       return `<span class="pill pill-${type}">${icon(EVENT_TYPES[type].icon)}${eventTypeLabel(t)}</span>`;
   }
   
   // Đếm số đời dựa trên quan hệ cha/mẹ (giống thuật toán vẽ cây), vì cột
   // generation trong DB chỉ có giá trị khi người dùng nhập tay, còn cây gia
   // phả luôn tự tính đời — dùng chung 1 nguồn tính để 2 nơi khớp nhau.
   function countRecordedGenerations(data) {
       if (!data.persons.length) return 0;
       const parentsOf = {};
       data.parent_child.forEach((link) => {
           (parentsOf[link.child_id] ??= []).push(link.parent_id);
       });
       const visibleIds = new Set(data.persons.map((p) => p.id));
       const generation = treeComputeGenerations(data.persons, data.parent_child, data.marriages, visibleIds, parentsOf);
       return new Set(Object.values(generation)).size;
   }

   function eventTypeLabel(t) {
       return (EVENT_TYPES[t] || EVENT_TYPES.custom).label;
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
                   <button type="button" class="pagination-btn" ${membersPage <= 1 ? "disabled" : ""} onclick="goToMembersPage(${membersPage - 1})">${icon("chevron-left")} Trước</button>
                   <span class="pagination-pages">Trang ${membersPage} / ${totalPages}</span>
                   <button type="button" class="pagination-btn" ${membersPage >= totalPages ? "disabled" : ""} onclick="goToMembersPage(${membersPage + 1})">Sau ${icon("chevron-right")}</button>
               </div>
           </div>
       `;
   }
   
   function renderMembersTable() {
       const wrap = document.getElementById("members-table-wrap");
       if (allPersons.length === 0) {
           const msg = document.getElementById("search-input").value.trim()
               ? "Không tìm thấy thành viên phù hợp."
               : "Chưa có thành viên nào. Nhấn \"Thêm thành viên\" để bắt đầu.";
           wrap.innerHTML = `<div class="table-card">${emptyStateHtml("users", msg)}</div>`;
           return;
       }
   
       const total = allPersons.length;
       const totalPages = Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE));
       if (membersPage > totalPages) membersPage = totalPages;
       const startIdx = (membersPage - 1) * MEMBERS_PAGE_SIZE;
       const pageItems = allPersons.slice(startIdx, startIdx + MEMBERS_PAGE_SIZE);
   
       wrap.innerHTML = `
           <div class="table-card">
               <table class="data-table">
                   <thead><tr><th>Họ tên</th><th>Giới tính</th><th>Đời</th><th>Năm sinh</th><th>Trạng thái</th></tr></thead>
                   <tbody>
                       ${pageItems.map(p => `
                           <tr class="clickable" onclick="openDetail(${p.id}, 'members')">
                               <td>
                                   <div class="member-name-cell">
                                       ${renderAvatarHtml(p.full_name, p.avatar_path, "", p.gender)}
                                       <div>
                                           <div class="member-name">${escapeHtml(p.full_name)}</div>
                                           ${p.nickname ? `<div class="member-nickname">${escapeHtml(p.nickname)}</div>` : ""}
                                       </div>
                                   </div>
                               </td>
                               <td>${genderPill(p.gender)}</td>
                               <td>${p.generation != null ? `<span class="pill pill-gen">Đời ${p.generation}</span>` : `<span class="cell-muted">—</span>`}</td>
                               <td class="cell-muted">${formatYear(p.birth_date)}</td>
                               <td>${statusPill(p.is_alive)}</td>
                           </tr>
                       `).join("")}
                   </tbody>
               </table>
               ${renderMembersPagination(total, totalPages)}
           </div>
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
   
       // Tên, giới tính, trạng thái, đời đã hiển thị trong thẻ hồ sơ bên dưới
       document.getElementById("detail-name").textContent = "Hồ sơ thành viên";
       document.getElementById("detail-subtitle").textContent = "Thông tin cá nhân và quan hệ gia đình";
   
       const spouseStatus = (s) => s.status === "married" ? "đang kết hôn" : s.status === "divorced" ? "đã ly hôn" : "góa";
       const relationItems = (list, removeCall, extra) => list.length
           ? list.map(r => `
               <li>
                   <button type="button" class="relation-person" onclick="openDetail(${r.id})" title="Xem hồ sơ">
                       ${renderAvatarHtml(r.full_name, r.avatar_path, "", r.gender)}
                       <span class="relation-name">${escapeHtml(r.full_name)}${extra ? ` <span class="relation-status">(${extra(r)})</span>` : ""}</span>
                   </button>
                   <button type="button" class="relation-remove" title="Xóa liên kết" onclick="${removeCall(r)}">${icon("x")}</button>
               </li>`).join("")
           : "<li class='relation-empty'>Chưa có thông tin</li>";
       const relationSection = (title, iconName, list, removeCall, mode, addLabel, extra) => `
           <div class="relation-section">
               <div class="relation-heading">
                   <h3 class="card-title">${icon(iconName)} ${title}${list.length ? ` <span class="card-count">${list.length}</span>` : ""}</h3>
               </div>
               <ul class="relation-list">${relationItems(list, removeCall, extra)}</ul>
               <button type="button" class="btn-secondary btn btn-sm relation-add" onclick="openRelationModal('${mode}')">${icon("plus")} ${addLabel}</button>
           </div>`;
       const infoRow = (iconName, label, value, note) => `
           <div class="info-row">
               <div class="info-icon">${icon(iconName)}</div>
               <div>
                   <dt>${label}</dt>
                   <dd class="${value ? "" : "muted"}">${value || "Chưa rõ"}${note ? ` <span class="info-note">(${escapeHtml(note)})</span>` : ""}</dd>
               </div>
           </div>`;

       const content = document.getElementById("detail-content");
       content.innerHTML = `
           <div class="profile-hero${person.is_alive ? "" : " is-deceased"}">
               ${renderAvatarHtml(person.full_name, person.avatar_path, "avatar-xl", person.gender)}
               <div class="profile-main">
                   <h2 class="profile-name">${escapeHtml(person.full_name)}</h2>
                   ${person.nickname ? `<div class="profile-nickname">Tên gọi khác: ${escapeHtml(person.nickname)}</div>` : ""}
                   <div class="profile-tags">
                       ${genderPill(person.gender)}
                       ${statusPill(person.is_alive)}
                       ${person.generation != null ? `<span class="pill pill-gen">${icon("layers")}Đời ${person.generation}</span>` : ""}
                       ${person.birth_date ? `<span class="pill pill-outline">${formatYear(person.birth_date)}${!person.is_alive && person.death_date ? ` – ${formatYear(person.death_date)}` : ""}</span>` : ""}
                   </div>
               </div>
               <div class="profile-actions">
                   <input type="file" id="detail-avatar-input" accept="image/jpeg,image/png,image/webp,image/gif" hidden />
                   <button type="button" class="btn-secondary btn btn-sm" id="btn-detail-change-avatar">${icon("image")} Đổi ảnh</button>
                   <button type="button" class="btn-ghost btn btn-sm" id="btn-detail-remove-avatar" ${person.avatar_path ? "" : "disabled"}>Xóa ảnh</button>
               </div>
           </div>
           <div class="detail-grid">
               <div class="card">
                   <h3 class="card-title">${icon("user")} Thông tin cá nhân</h3>
                   <dl class="info-list">
                       ${infoRow("cake", "Ngày sinh", formatDateVN(person.birth_date), person.birth_date_note)}
                       ${!person.is_alive ? infoRow("flame", "Ngày mất", formatDateVN(person.death_date), person.death_date_note) : ""}
                       ${infoRow("pin", "Nơi sinh", escapeHtml(person.birth_place))}
                       ${infoRow("briefcase", "Nghề nghiệp", escapeHtml(person.occupation))}
                       <div class="info-row">
                           <div class="info-icon">${icon("book")}</div>
                           <div>
                               <dt>Tiểu sử</dt>
                               <dd class="info-bio ${person.biography ? "" : "muted"}">${escapeHtml(person.biography) || "Chưa có"}</dd>
                           </div>
                       </div>
                   </dl>
               </div>
               <div class="card">
                   ${relationSection("Cha / Mẹ", "user", person.parents, (p) => `removeParentChildLink(${p.id}, ${person.id})`, "parent", "Thêm cha/mẹ")}
                   ${relationSection("Vợ / Chồng", "heart", person.spouses, (s) => `removeMarriageLink(${s.marriage_id})`, "spouse", "Thêm vợ/chồng", spouseStatus)}
               </div>
               <div class="card">
                   ${relationSection("Con cái", "child", person.children, (c) => `removeParentChildLink(${person.id}, ${c.id})`, "child", "Thêm con")}
               </div>
           </div>
           <div class="card danger-zone">
               <div class="danger-zone-text">
                   ${icon("alert")}
                   <div>
                       <div class="danger-zone-title">Xóa thành viên</div>
                       <div class="danger-zone-desc">Xóa vĩnh viễn hồ sơ này cùng các liên kết quan hệ. Không thể hoàn tác.</div>
                   </div>
               </div>
               <button class="btn btn-danger" onclick="deletePerson(${person.id})">${icon("trash")} Xóa thành viên này</button>
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
   let lastEventsData = [];
   let renderedEvents = []; // danh sách đang hiển thị (đã lọc) — dùng khi bấm Sửa
   let eventsFilter = "all";

   async function loadEvents() {
       lastEventsData = await apiGet("/events");
       renderEventsList();
   }

   function renderEventsList() {
       const list = document.getElementById("events-list");
       const events = eventsFilter === "all"
           ? lastEventsData
           : lastEventsData.filter((e) => e.event_type === eventsFilter);

       if (events.length === 0) {
           const msg = lastEventsData.length === 0
               ? "Chưa có sự kiện nào."
               : "Không có sự kiện nào thuộc loại này.";
           list.innerHTML = `<div class="table-card">${emptyStateHtml("calendar", msg)}</div>`;
           return;
       }
       renderedEvents = events;
       list.innerHTML = `
           <div class="table-card">
               <table class="data-table">
                   <thead><tr><th>Ngày</th><th>Người liên quan</th><th>Loại</th><th>Lịch</th><th>Mô tả</th><th></th></tr></thead>
                   <tbody>
                       ${events.map((e, i) => `
                           <tr class="clickable" onclick="openEventModal(renderedEvents[${i}])" title="Bấm để sửa">
                               <td>${renderDateBadge(e.event_date)}</td>
                               <td class="member-name">${escapeHtml(e.full_name)}</td>
                               <td><div class="tag-group">${eventTypePill(e.event_type)}${e.auto ? `<span class="event-auto-badge" title="Tự động lấy từ ngày sinh/ngày mất trong hồ sơ">Tự động</span>` : ""}</div></td>
                               <td class="cell-muted">${e.calendar_type === "lunar" ? "Âm lịch" : "Dương lịch"}</td>
                               <td class="cell-muted">${escapeHtml(e.description) || "—"}</td>
                               <td class="cell-actions" onclick="event.stopPropagation()">
                                   <div class="btn-row row-actions">
                                       <button class="btn-ghost btn btn-sm" title="Sửa sự kiện" onclick="openEventModal(renderedEvents[${i}])">${icon("edit")} Sửa</button>
                                       ${e.auto ? "" : `<button class="btn-ghost btn btn-sm btn-ghost-danger" title="Xóa sự kiện" onclick="deleteEvent(${e.id})">${icon("trash")} Xóa</button>`}
                                   </div>
                               </td>
                           </tr>
                       `).join("")}
                   </tbody>
               </table>
           </div>
       `;
   }

   document.querySelectorAll(".event-filter-btn").forEach((btn) => {
       btn.addEventListener("click", () => {
           eventsFilter = btn.dataset.filter;
           document.querySelectorAll(".event-filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
           renderEventsList();
       });
   });
   
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
   
   // ============================================================
   // MODAL: THÊM / SỬA SỰ KIỆN
   // - ev = null      -> thêm mới
   // - ev có id       -> sửa sự kiện đã lưu (PUT)
   // - ev.auto = true -> sự kiện tự sinh từ hồ sơ: lưu lại sẽ tạo 1 bản riêng
   //   (POST), backend ưu tiên bản riêng này thay cho bản tự sinh cùng loại.
   // ============================================================
   const eventModal = document.getElementById("event-modal");
   let editingEvent = null;

   async function openEventModal(ev) {
       editingEvent = ev || null;
       const persons = await apiGet("/persons");
       const sel = document.getElementById("e-person_id");
       sel.innerHTML = persons.map(p => `<option value="${p.id}">${escapeHtml(p.full_name)}</option>`).join("");
       document.getElementById("event-form").reset();

       const isEdit = !!ev;
       document.getElementById("event-modal-title").textContent = isEdit ? "Sửa sự kiện" : "Thêm sự kiện";
       document.getElementById("event-modal-subtitle").textContent = ev?.auto
           ? "Sự kiện này tự lấy từ hồ sơ. Lưu lại sẽ tạo bản riêng (VD: đổi sang ngày âm lịch) thay cho bản tự động."
           : "Ngày giỗ, sinh nhật hoặc sự kiện quan trọng của dòng họ";
       if (isEdit) {
           sel.value = String(ev.person_id);
           document.getElementById("e-event_type").value = EVENT_TYPES[ev.event_type] ? ev.event_type : "custom";
           document.getElementById("e-calendar_type").value = ev.calendar_type || "solar";
           document.getElementById("e-event_date").value = ev.event_date || "";
           document.getElementById("e-description").value = ev.description || "";
       }
       ["e-person_id", "e-event_type", "e-calendar_type"].forEach((id) => SearchSelect.refresh(document.getElementById(id)));
       SearchSelect.closeAll();
       eventModal.classList.add("open");
   }

   function closeEventModal() {
       SearchSelect.closeAll();
       eventModal.classList.remove("open");
       editingEvent = null;
   }

   document.getElementById("btn-add-event").addEventListener("click", () => openEventModal(null));
   document.getElementById("btn-cancel-event").addEventListener("click", closeEventModal);

   document.getElementById("event-form").addEventListener("submit", async (e) => {
       e.preventDefault();
       const payload = {
           person_id: parseInt(document.getElementById("e-person_id").value),
           event_type: document.getElementById("e-event_type").value,
           calendar_type: document.getElementById("e-calendar_type").value,
           event_date: document.getElementById("e-event_date").value || null,
           description: document.getElementById("e-description").value || null,
       };
       try {
           if (editingEvent?.id) {
               await apiSend(`/events/${editingEvent.id}`, "PUT", payload);
               showToast("Đã lưu thay đổi sự kiện", "success");
           } else {
               await apiSend("/events", "POST", payload);
               showToast(editingEvent ? "Đã lưu sự kiện" : "Đã thêm sự kiện", "success");
           }
           closeEventModal();
           loadEvents();
       } catch (err) {
           showToast(err.message, "error");
       }
   });
   
   // ============================================================
   // TAB: CÂY GIA PHẢ
   // ------------------------------------------------------------
   // THUẬT TOÁN BỐ CỤC: đệ quy từ gốc xuống (kiểu Reingold-Tilford rút gọn).
   //   1) Mỗi "gia đình" = 1 người trong họ + TẤT CẢ vợ/chồng của họ (hỗ trợ
   //      tái hôn). Dâu/rể đứng cạnh vợ/chồng, không vẽ lặp ở nhà cha mẹ ruột
   //      mà nối về đó bằng nét đứt.
   //   2) Con gắn vào đúng gia đình của cha/mẹ, đường nối xuất phát từ đúng
   //      cặp cha mẹ (con vợ cả / con vợ hai / con riêng tách nhánh riêng).
   //   3) Mỗi nhánh được cấp riêng 1 "băng ngang" — anh chị em ruột LUÔN
   //      nằm cạnh nhau, xếp theo năm sinh. Độ rộng băng tính TỪ DƯỚI LÊN,
   //      toạ độ gán TỪ TRÊN XUỐNG.
   //   4) Dòng họ lớn nhất làm cây chính, các gia đình bên ngoại/nội nhỏ
   //      hơn đứng sau — không còn phụ thuộc thứ tự tên theo bảng chữ cái.
   // ============================================================
   const NODE_W = 190;
   const NODE_H = 68;
   const H_GAP = 46;
   const V_GAP = 120;
   const NODE_TOP = 40;
   const NODE_AVATAR_R = 20;
   const NODE_TEXT_X = 64;
   
   let lastTreeData = null;
   let lastTreeRootId = null;
let treeScale = 1;
const TREE_SCALE_MIN = 0.2;
const TREE_SCALE_MAX = 3;
const TREE_SCALE_STEP = 0.1;
let lastTreeExport = null; // { svg, canvasWidth, canvasHeight } - dùng để xuất PNG/JPG/PDF

// CSS dùng màu chữ trực tiếp (không dùng var(--...)) vì khi xuất ảnh/PDF,
// SVG được tách ra khỏi trang (blob/print riêng) nên không truy cập được biến CSS của :root.
const TREE_SVG_STYLE = `
.tree-node-card.deceased { opacity: 0.7; }
.tree-node-card rect.card-bg { fill: #FFFCF7; stroke: #DCCBA8; stroke-width: 1.2; filter: url(#node-shadow); }
.tree-node-card:hover rect.card-bg { stroke: #9A2C24; stroke-width: 1.8; }
.tree-node-card text.node-name { font-family: "Segoe UI", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 13.5px; font-weight: 600; fill: #2A1F17; }
.tree-node-card text.node-years { font-family: "Segoe UI", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 11.5px; fill: #8A7B66; }
.tree-node-card text.node-avatar-letter { font-family: "Segoe UI", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; font-weight: 700; fill: #FFFCF7; text-anchor: middle; dominant-baseline: central; }
.tree-node-card text.gen-label { font-family: "Segoe UI", -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 9.5px; font-weight: 700; fill: #8A6526; text-anchor: middle; }
.edge-line { stroke: #C4A46A; stroke-width: 1.6; fill: none; stroke-linejoin: round; }
.marriage-line { stroke: #9A2C24; stroke-width: 2; fill: none; }
.marriage-dot { fill: #9A2C24; stroke: #FFFCF7; stroke-width: 2; }
.marriage-line.divorced { stroke-dasharray: 6 4; opacity: 0.7; }
.marriage-line.extra { stroke-dasharray: 4 4; stroke-width: 1.6; }
.cross-line { stroke: #B8893B; stroke-width: 1.4; stroke-dasharray: 5 4; fill: none; opacity: 0.85; }
`;

function updateTreeZoomLabel() {
    const label = document.getElementById("tree-zoom-label");
    if (label) label.textContent = `${Math.round(treeScale * 100)}%`;
}

function setTreeScale(nextScale) {
    const clamped = Math.max(TREE_SCALE_MIN, Math.min(TREE_SCALE_MAX, nextScale));
    if (Math.abs(clamped - treeScale) < 0.001) return;
    treeScale = clamped;
    updateTreeZoomLabel();
    if (lastTreeData) drawTree(lastTreeData, lastTreeRootId);
}
   
   function treeGenderColor(gender) {
       if (gender === "male") return "#43678A";
       if (gender === "female") return "#A54F72";
       return "#8A7F6B";
   }
   
   function treeAvatarInitial(name) {
       const parts = name.trim().split(/\s+/);
       return (parts[parts.length - 1]?.[0] || "?").toUpperCase();
   }
   
   function formatTreeYears(p) {
       return formatYear(p.birth_date);
   }
   
   function treeComputeGenerations(persons, parent_child, marriages, visibleIds, parentsOf) {
       const generation = {};
       persons
           .filter((p) => visibleIds.has(p.id) && !(parentsOf[p.id] || []).some((pid) => visibleIds.has(pid)))
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
               // Gốc của 1 gia đình bên ngoại/nội (không có cha mẹ trong gia phả) có con
               // kết hôn vào đời sâu hơn -> hạ cả gốc đó xuống để cha mẹ luôn ngay trên con 1 đời.
               // Chỉ áp dụng cho gốc, tránh vòng lặp vô hạn khi có hôn nhân lệch đời.
               const parentIsRoot = !(parentsOf[link.parent_id] || []).some((pid) => visibleIds.has(pid));
               if (parentIsRoot && generation[link.child_id] != null) {
                   const need = generation[link.child_id] - 1;
                   if (generation[link.parent_id] == null || generation[link.parent_id] < need) {
                       generation[link.parent_id] = need;
                       changed = true;
                   }
               }
           });
           marriages.forEach((m) => {
               if (!visibleIds.has(m.person1_id) || !visibleIds.has(m.person2_id)) return;
               const g1 = generation[m.person1_id];
               const g2 = generation[m.person2_id];
               if (g1 != null && g2 != null && g1 !== g2) {
                   // Không kéo người đã có nhánh con cháu xuống đời thấp hơn.
                   // Nếu lệch đời thì nâng người thấp lên theo người cao.
                   const g = Math.max(g1, g2);
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
   
   async function loadTree() {
       const data = await apiGet("/tree");
       lastTreeData = data;
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

document.getElementById("btn-tree-zoom-in").addEventListener("click", () => {
    setTreeScale(treeScale + TREE_SCALE_STEP);
});
document.getElementById("btn-tree-zoom-out").addEventListener("click", () => {
    setTreeScale(treeScale - TREE_SCALE_STEP);
});
document.getElementById("btn-tree-zoom-reset").addEventListener("click", () => {
    setTreeScale(1);
});

// ============================================================
// PAN (kéo chuột để di chuyển) + ZOOM BẰNG CTRL + LĂN CHUỘT
// ============================================================
const treeWrapEl = document.getElementById("tree-canvas-wrap");
let treePanState = null;
let treeSuppressNextClick = false;

treeWrapEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    treePanState = {
        startX: e.clientX,
        startY: e.clientY,
        startScrollLeft: treeWrapEl.scrollLeft,
        startScrollTop: treeWrapEl.scrollTop,
        moved: false,
    };
});

window.addEventListener("mousemove", (e) => {
    if (!treePanState) return;
    const dx = e.clientX - treePanState.startX;
    const dy = e.clientY - treePanState.startY;
    if (!treePanState.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        treePanState.moved = true;
        treeWrapEl.classList.add("panning");
    }
    if (treePanState.moved) {
        treeWrapEl.scrollLeft = treePanState.startScrollLeft - dx;
        treeWrapEl.scrollTop = treePanState.startScrollTop - dy;
    }
});

window.addEventListener("mouseup", () => {
    if (treePanState && treePanState.moved) {
        treeWrapEl.classList.remove("panning");
        treeSuppressNextClick = true;
    }
    treePanState = null;
});

treeWrapEl.addEventListener("dragstart", (e) => e.preventDefault());

// Chặn sự kiện click "ảo" phát sinh ngay sau khi vừa kéo (pan) xong,
// tránh vô tình mở chi tiết thành viên nằm dưới điểm thả chuột.
treeWrapEl.addEventListener("click", (e) => {
    if (treeSuppressNextClick) {
        treeSuppressNextClick = false;
        e.stopPropagation();
        e.preventDefault();
    }
}, true);

treeWrapEl.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const rect = treeWrapEl.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const ratioX = (treeWrapEl.scrollLeft + cursorX) / treeWrapEl.scrollWidth;
    const ratioY = (treeWrapEl.scrollTop + cursorY) / treeWrapEl.scrollHeight;
    const delta = e.deltaY > 0 ? -TREE_SCALE_STEP : TREE_SCALE_STEP;
    setTreeScale(treeScale + delta);
    requestAnimationFrame(() => {
        treeWrapEl.scrollLeft = ratioX * treeWrapEl.scrollWidth - cursorX;
        treeWrapEl.scrollTop = ratioY * treeWrapEl.scrollHeight - cursorY;
    });
}, { passive: false });

// ============================================================
// XUẤT CÂY GIA PHẢ: PNG / JPG / PDF
// ============================================================
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function treeExportFilename(ext) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `cay-gia-pha_${stamp}.${ext}`;
}

async function renderTreeToCanvas(scaleFactor) {
    const { svg, canvasWidth, canvasHeight } = lastTreeExport;
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    try {
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Không thể dựng ảnh từ SVG"));
            image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(canvasWidth * scaleFactor);
        canvas.height = Math.ceil(canvasHeight * scaleFactor);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFCF7";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas;
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function exportTreeRaster(format) {
    if (!lastTreeExport) { showToast("Chưa có cây để xuất.", "info"); return; }
    try {
        const canvas = await renderTreeToCanvas(2);
        const mime = format === "jpg" ? "image/jpeg" : "image/png";
        const filename = treeExportFilename(format);

        // Chạy trong cửa sổ desktop (pywebview): mở hộp thoại "Lưu file" thật của
        // hệ điều hành để người dùng tự chọn nơi lưu, thay vì tải thẳng vào Downloads.
        if (window.pywebview?.api?.save_file) {
            const base64 = canvas.toDataURL(mime, 0.95).split(",")[1];
            const fileTypes = format === "jpg" ? ["Ảnh JPG (*.jpg)"] : ["Ảnh PNG (*.png)"];
            const result = await window.pywebview.api.save_file(filename, base64, fileTypes);
            if (result?.ok) {
                showToast(`Đã lưu: ${result.path}`, "success");
            } else if (!result?.canceled) {
                showToast(result?.error || "Không thể lưu file.", "error");
            }
            return;
        }

        canvas.toBlob((blob) => {
            if (!blob) { showToast("Không thể xuất ảnh.", "error"); return; }
            downloadBlob(blob, filename);
            showToast("Đã xuất ảnh cây gia phả", "success");
        }, mime, 0.95);
    } catch (err) {
        showToast(err.message, "error");
    }
}

function exportTreePdfViaPrint() {
    if (!lastTreeExport) { showToast("Chưa có cây để xuất.", "info"); return; }
    const printArea = document.getElementById("tree-print-area");
    printArea.innerHTML = lastTreeExport.svg;
    const cleanup = () => {
        printArea.innerHTML = "";
        window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
}

document.getElementById("btn-tree-export-png").addEventListener("click", () => exportTreeRaster("png"));
document.getElementById("btn-tree-export-jpg").addEventListener("click", () => exportTreeRaster("jpg"));
document.getElementById("btn-tree-export-pdf")?.addEventListener("click", () => exportTreePdfViaPrint());

   function drawTree(data, rootId) {
       lastTreeRootId = rootId;
       const { persons, parent_child, marriages } = data;
       const byId = Object.fromEntries(persons.map((p) => [p.id, p]));

       const childrenOf = {};
       const parentsOf = {};
       parent_child.forEach((link) => {
           if (!byId[link.parent_id] || !byId[link.child_id]) return;
           (childrenOf[link.parent_id] ??= []).push(link.child_id);
           (parentsOf[link.child_id] ??= []).push(link.parent_id);
       });

       // Xác định người sẽ hiển thị: toàn bộ, hoặc chỉ hậu duệ + vợ/chồng của rootId
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
           let expanded = true;
           while (expanded) {
               expanded = false;
               marriages.forEach((m) => {
                   if (visibleIds.has(m.person1_id) && !visibleIds.has(m.person2_id)) { visibleIds.add(m.person2_id); expanded = true; }
                   else if (visibleIds.has(m.person2_id) && !visibleIds.has(m.person1_id)) { visibleIds.add(m.person1_id); expanded = true; }
               });
           }
       }
       const isVisible = (id) => visibleIds.has(id);
       const visibleParents = (id) => (parentsOf[id] || []).filter(isVisible);

       const generation = treeComputeGenerations(persons, parent_child, marriages, visibleIds, parentsOf);

       // Anh chị em xếp theo ngày sinh (chưa rõ ngày sinh thì xếp cuối), trùng thì theo tên
       const birthKey = (id) => byId[id].birth_date || "9999";
       const byBirth = (a, b) =>
           birthKey(a).localeCompare(birthKey(b)) || byId[a].full_name.localeCompare(byId[b].full_name, "vi");

       // ============================================================
       // BƯỚC 1: MỖI CUỘC HÔN NHÂN -> 1 "CHỦ" (người trong họ) + 1 "DÂU/RỂ"
       // - Người có cha/mẹ trong gia phả là người trong họ -> làm chủ.
       // - Cả hai đều có cha/mẹ trong gia phả -> theo bên chồng (gia phả Việt
       //   theo dòng nội), bên vợ được nối tới bằng đường nét đứt.
       // - 1 người làm chủ được NHIỀU vợ/chồng (tái hôn) -> vẽ đủ cạnh nhau.
       // ============================================================
       const hostOf = {};    // dâu/rể -> người chủ
       const spousesOf = {}; // người chủ -> [dâu/rể]
       const marriageStatus = {};
       const extraMarriages = []; // hôn nhân không xếp cạnh nhau được -> nối nét đứt
       const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

       function preferredHost(a, b) {
           const aBlood = visibleParents(a).length > 0;
           const bBlood = visibleParents(b).length > 0;
           if (aBlood !== bBlood) return aBlood ? a : b;
           const aMale = byId[a].gender === "male";
           const bMale = byId[b].gender === "male";
           if (aMale !== bMale) return aMale ? a : b;
           return Math.min(a, b);
       }

       marriages
           .filter((m) => isVisible(m.person1_id) && isVisible(m.person2_id) && m.person1_id !== m.person2_id)
           .forEach((m) => {
               marriageStatus[pairKey(m.person1_id, m.person2_id)] = m.status;
               let host = preferredHost(m.person1_id, m.person2_id);
               let guest = host === m.person1_id ? m.person2_id : m.person1_id;
               // Người kia đã là chủ của 1 gia đình khác -> đổi vai để không phải tách gia đình đó
               if (spousesOf[guest]?.length && !spousesOf[host]?.length) [host, guest] = [guest, host];
               if (hostOf[host] != null || hostOf[guest] != null || spousesOf[guest]?.length) {
                   extraMarriages.push([m.person1_id, m.person2_id]);
                   return;
               }
               hostOf[guest] = host;
               (spousesOf[host] ??= []).push(guest);
           });

       // Thẻ của 1 gia đình (trái -> phải): vợ/chồng xen kẽ 2 bên người chủ
       // 1 vợ/chồng: [chủ][vc1] — 2 vợ/chồng: [vc2][chủ][vc1] — ...
       const cardsCache = {};
       function cardsOf(hostId) {
           if (cardsCache[hostId]) return cardsCache[hostId];
           const left = [];
           const right = [];
           (spousesOf[hostId] || []).forEach((s, i) => (i % 2 === 0 ? right : left).push(s));
           return (cardsCache[hostId] = [...left.reverse(), hostId, ...right]);
       }
       const unitOfPerson = (id) => hostOf[id] ?? id;

       // ============================================================
       // BƯỚC 2: GẮN MỖI NGƯỜI TRONG HỌ VÀO ĐÚNG GIA ĐÌNH CỦA CHA/MẸ
       // (dâu/rể không được gắn vào gia đình cha mẹ ruột — họ đứng cạnh
       //  vợ/chồng, đường nối về cha mẹ ruột vẽ nét đứt ở bước 5)
       // ============================================================
       const primaryIds = persons.map((p) => p.id).filter((id) => isVisible(id) && hostOf[id] == null);
       const childLinks = {}; // hostId -> [{ childId, parentIds }]
       primaryIds.forEach((cid) => {
           const ps = visibleParents(cid);
           if (!ps.length) return;
           // Ưu tiên cha/mẹ là người chủ của gia đình; có cả cha lẫn mẹ là người chủ thì theo cha
           const sorted = [...ps].sort((a, b) =>
               (hostOf[a] != null) - (hostOf[b] != null) ||
               (byId[b].gender === "male") - (byId[a].gender === "male"));
           const hostId = unitOfPerson(sorted[0]);
           if (hostId === cid) return;
           const cards = cardsOf(hostId);
           (childLinks[hostId] ??= []).push({ childId: cid, parentIds: ps.filter((p) => cards.includes(p)) });
       });

       // ============================================================
       // BƯỚC 3: DỰNG CÂY (mỗi gia đình đứng ở đúng 1 vị trí)
       // ============================================================
       const built = new Set();
       function build(hostId) {
           built.add(hostId);
           const cards = cardsOf(hostId);
           // Con xếp theo nhóm cha/mẹ (con vợ trái ở trái, con vợ phải ở phải), trong nhóm theo ngày sinh
           const slot = (l) => l.parentIds.reduce((s, p) => s + cards.indexOf(p), 0) / l.parentIds.length;
           const links = [...(childLinks[hostId] || [])].sort((a, b) => slot(a) - slot(b) || byBirth(a.childId, b.childId));
           const children = [];
           links.forEach((l) => {
               if (built.has(l.childId)) return; // chống vòng lặp khi dữ liệu sai
               const child = build(l.childId);
               child.parentIds = l.parentIds;
               children.push(child);
           });
           return { id: hostId, cards, children };
       }

       const forest = primaryIds.filter((id) => visibleParents(id).length === 0).map(build);
       // An toàn: còn ai chưa được xếp (dữ liệu vòng lặp hiếm gặp) -> thêm làm gốc lẻ
       primaryIds.filter((id) => !built.has(id)).forEach((id) => forest.push(build(id)));
       // Dòng họ lớn nhất đứng đầu (bên trái), các gia đình bên ngoại/nội nhỏ hơn xếp sau
       const sizeOf = (n) => n.cards.length + n.children.reduce((s, c) => s + sizeOf(c), 0);
       forest.sort((a, b) => sizeOf(b) - sizeOf(a) || byBirth(a.id, b.id));

       // ============================================================
       // BƯỚC 4: TÍNH ĐỘ RỘNG BĂNG (từ dưới lên) & GÁN TOẠ ĐỘ X (từ trên xuống)
       // Mỗi nhánh nằm gọn trong băng của nó -> anh chị em ruột luôn cạnh nhau.
       // ============================================================
       const CARD_STEP = NODE_W + H_GAP;
       function computeWidth(n) {
           n.unitW = n.cards.length * NODE_W + (n.cards.length - 1) * H_GAP;
           n.childrenW = n.children.reduce((s, c) => s + computeWidth(c), 0) + Math.max(0, n.children.length - 1) * H_GAP;
           return (n.width = Math.max(n.unitW, n.childrenW));
       }
       forest.forEach(computeWidth);

       // Vị trí x (tính từ mép trái gia đình) của điểm xuất phát đường nối xuống con:
       // con chung của 1 cặp -> chấm tròn giữa 2 vợ chồng; con riêng -> giữa thẻ cha/mẹ đó
       function anchorOffset(cards, parentIds) {
           const hostIdx = cards.indexOf(cards.find((id) => hostOf[id] == null));
           const idx = parentIds.map((p) => cards.indexOf(p));
           if (idx.length >= 2 && idx.includes(hostIdx)) {
               const other = idx.find((i) => i !== hostIdx);
               return other > hostIdx ? other * CARD_STEP - H_GAP / 2 : (other + 1) * CARD_STEP - H_GAP / 2;
           }
           return idx.reduce((s, i) => s + i * CARD_STEP + NODE_W / 2, 0) / idx.length;
       }

       const posX = {};
       function assignX(n, leftX) {
           let unitLeft = leftX + (n.width - n.unitW) / 2;
           if (n.children.length) {
               let cursor = leftX + (n.width - n.childrenW) / 2;
               n.children.forEach((c) => {
                   assignX(c, cursor);
                   cursor += c.width + H_GAP;
               });
               // Canh để điểm xuất phát nằm thẳng trên giữa đàn con
               const first = n.children[0];
               const last = n.children[n.children.length - 1];
               const kidsCenter = (posX[first.id] + posX[last.id]) / 2 + NODE_W / 2;
               const anchor = (anchorOffset(n.cards, first.parentIds) + anchorOffset(n.cards, last.parentIds)) / 2;
               unitLeft = Math.min(Math.max(kidsCenter - anchor, leftX), leftX + n.width - n.unitW);
           }
           n.left = unitLeft;
           n.cards.forEach((id, i) => (posX[id] = unitLeft + i * CARD_STEP));
       }
       let cursorX = 0;
       forest.forEach((n) => {
           assignX(n, cursorX);
           cursorX += n.width + H_GAP * 2; // khoảng cách rộng hơn giữa các cây độc lập
       });

       const contentWidth = Math.max(0, cursorX - H_GAP * 2);
       const canvasWidth = Math.max(contentWidth + 80, 900);
       const offsetX = (canvasWidth - contentWidth) / 2;
       Object.keys(posX).forEach((id) => (posX[id] += offsetX));

       // Cả gia đình (chủ + vợ/chồng) đứng chung 1 hàng theo đời của người chủ
       const posY = {};
       const unitOfCard = {};
       (function walk(nodes) {
           nodes.forEach((n) => {
               n.left += offsetX;
               n.y = generation[n.id] * V_GAP + NODE_TOP;
               n.cards.forEach((id) => { posY[id] = n.y; unitOfCard[id] = n; });
               walk(n.children);
           });
       })(forest);

       const maxY = Object.values(posY).reduce((m, y) => Math.max(m, y), 0);
       const canvasHeight = maxY + NODE_H + 60;
       const scaledWidth = Math.ceil(canvasWidth * treeScale);
       const scaledHeight = Math.ceil(canvasHeight * treeScale);

       // ============================================================
       // BƯỚC 5: VẼ SVG (đường nối trước, thẻ người sau)
       // ============================================================
       let svgDefs = "<defs><filter id=\"node-shadow\" x=\"-10%\" y=\"-20%\" width=\"120%\" height=\"150%\"><feDropShadow dx=\"0\" dy=\"2\" stdDeviation=\"3\" flood-color=\"#2A1F17\" flood-opacity=\"0.12\" /></filter>";
       persons.filter((p) => isVisible(p.id) && p.avatar_path).forEach((p) => {
           svgDefs += `<clipPath id="clip-${p.id}"><circle cx="0" cy="0" r="${NODE_AVATAR_R}" /></clipPath>`;
       });
       svgDefs += "</defs>";
       const svgParts = [`<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">${svgDefs}<style>${TREE_SVG_STYLE}</style>`];
       const centerX = (id) => posX[id] + NODE_W / 2;

       // Điểm xuất phát (x, y) của đường nối từ cha/mẹ xuống con
       function anchorPoint(n, parentIds) {
           const x = n.left + anchorOffset(n.cards, parentIds);
           const isCouple = parentIds.length >= 2 && parentIds.includes(n.id);
           return { x, y: isCouple ? n.y + NODE_H / 2 : n.y + NODE_H };
       }

       function drawConnectors(n) {
           // Đường hôn nhân: người chủ -> từng vợ/chồng
           (spousesOf[n.id] || []).forEach((s) => {
               const y = n.y + NODE_H / 2;
               const right = posX[s] > posX[n.id];
               const x1 = right ? posX[n.id] + NODE_W - 8 : posX[s] + NODE_W - 8;
               const x2 = right ? posX[s] + 8 : posX[n.id] + 8;
               const dotX = right ? posX[s] - H_GAP / 2 : posX[s] + NODE_W + H_GAP / 2;
               const divorced = marriageStatus[pairKey(n.id, s)] === "divorced";
               svgParts.push(`<line class="marriage-line${divorced ? " divorced" : ""}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" />`);
               svgParts.push(`<circle class="marriage-dot" cx="${dotX}" cy="${y}" r="6" />`);
           });

           // Đường cha/mẹ -> con, mỗi nhóm cha/mẹ (con chung / con riêng) 1 nhánh riêng
           const groups = [];
           n.children.forEach((c) => {
               const key = [...c.parentIds].sort().join(",");
               let g = groups.find((x) => x.key === key);
               if (!g) groups.push((g = { key, parentIds: c.parentIds, kids: [] }));
               g.kids.push(c);
           });
           groups.forEach((g, gi) => {
               const a = anchorPoint(n, g.parentIds);
               const childTop = Math.min(...g.kids.map((c) => c.y));
               const parentBottom = n.y + NODE_H;
               // Nhiều nhóm con -> mỗi nhóm 1 độ cao rẽ nhánh khác nhau để không chồng lên nhau
               const forkY = parentBottom + (childTop - parentBottom) / 2 + (gi - (groups.length - 1) / 2) * 12;
               const xs = g.kids.map((c) => centerX(c.id));
               const minX = Math.min(a.x, ...xs);
               const maxX = Math.max(a.x, ...xs);
               svgParts.push(`<path class="edge-line" d="M ${a.x} ${a.y} L ${a.x} ${forkY} M ${minX} ${forkY} L ${maxX} ${forkY}" />`);
               g.kids.forEach((c) => svgParts.push(`<path class="edge-line" d="M ${centerX(c.id)} ${forkY} L ${centerX(c.id)} ${c.y}" />`));
           });
           n.children.forEach(drawConnectors);
       }
       forest.forEach(drawConnectors);

       // Dâu/rể có cha mẹ ruột trong gia phả -> nét đứt từ cha mẹ ruột tới họ
       Object.keys(hostOf).map(Number).forEach((guestId) => {
           const ps = visibleParents(guestId).filter((p) => unitOfCard[p]);
           if (!ps.length) return;
           const n = unitOfCard[ps[0]];
           const a = anchorPoint(n, ps.filter((p) => n.cards.includes(p)));
           const gx = centerX(guestId);
           const gy = posY[guestId];
           const startY = n.y + NODE_H;
           const midY = (startY + gy) / 2;
           svgParts.push(`<path class="cross-line" d="M ${a.x} ${a.y} L ${a.x} ${startY + 12} C ${a.x} ${midY} ${gx} ${midY} ${gx} ${gy}" />`);
       });

       // Hôn nhân không xếp cạnh nhau được (VD: 1 người tái hôn với 2 người đều là người trong họ)
       extraMarriages.forEach(([a, b]) => {
           if (posX[a] == null || posX[b] == null) return;
           const ax = centerX(a);
           const bx = centerX(b);
           const lift = 34;
           svgParts.push(`<path class="marriage-line extra" d="M ${ax} ${posY[a]} C ${ax} ${Math.min(posY[a], posY[b]) - lift} ${bx} ${Math.min(posY[a], posY[b]) - lift} ${bx} ${posY[b]}" />`);
       });

       function drawAvatar(p, cx, cy, r) {
           const genderColor = treeGenderColor(p.gender);
           if (p.avatar_path) {
               return `
                   <circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="#FFFCF7" stroke="${genderColor}" stroke-opacity="0.35" />
                   <circle cx="${cx}" cy="${cy}" r="${r}" fill="${genderColor}" />
                   <g transform="translate(${cx}, ${cy})">
                       <image href="/uploads/${p.avatar_path}" x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}"
                           clip-path="url(#clip-${p.id})" preserveAspectRatio="xMidYMid slice" />
                   </g>`;
           }
           return `
               <circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="#FFFCF7" stroke="${genderColor}" stroke-opacity="0.35" />
               <circle cx="${cx}" cy="${cy}" r="${r}" fill="${genderColor}" />
               <text class="node-avatar-letter" x="${cx}" y="${cy}" text-anchor="middle" font-size="${Math.round(r * 0.75)}">${escapeHtml(treeAvatarInitial(p.full_name))}</text>`;
       }

       Object.keys(posX).map(Number).forEach((pid) => {
           const p = byId[pid];
           const x = posX[pid];
           const y = posY[pid];
           const alive = p.is_alive === 1 || p.is_alive === true;
           svgParts.push(`
               <g class="tree-node-card${alive ? "" : " deceased"}" onclick="openDetailFromTree(${p.id})">
                   <title>${escapeHtml(p.full_name)}</title>
                   <rect class="card-bg" x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10" />
                   <rect x="${x + 5}" y="${y + 14}" width="3" height="${NODE_H - 28}" rx="1.5" fill="${treeGenderColor(p.gender)}" />
                   ${drawAvatar(p, x + 34, y + NODE_H / 2, NODE_AVATAR_R)}
                   <text class="node-name" x="${x + NODE_TEXT_X}" y="${y + 27}">${escapeHtml(truncate(p.full_name, 18))}</text>
                   <text class="node-years" x="${x + NODE_TEXT_X}" y="${y + 45}">${formatTreeYears(p)}</text>
                   <rect x="${x + NODE_W - 58}" y="${y + NODE_H - 22}" width="50" height="16" rx="8" fill="rgba(184,137,59,0.16)" />
                   <text class="gen-label" x="${x + NODE_W - 33}" y="${y + NODE_H - 10}">Đời ${generation[pid]}</text>
               </g>
           `);
       });

       svgParts.push("</svg>");
       const svg = svgParts.join("");
       lastTreeExport = { svg, canvasWidth, canvasHeight };

       const wrap = document.getElementById("tree-canvas-wrap");
    updateTreeZoomLabel();
       if (persons.filter((p) => visibleIds.has(p.id)).length === 0) {
           wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">${icon("tree")}</div>Chưa có dữ liệu để vẽ cây gia phả. Hãy thêm thành viên và thiết lập quan hệ trước.</div>`;
       } else {
        wrap.innerHTML = `
            <div class="tree-scale-box" style="width:${scaledWidth}px;height:${scaledHeight}px">
                <div class="tree-svg-center" style="width:${canvasWidth}px;transform:scale(${treeScale})">
                    ${svg}
                </div>
            </div>
        `;
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