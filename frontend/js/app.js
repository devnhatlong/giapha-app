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
       const [stats, treeData] = await Promise.all([apiGet("/stats"), apiGet("/tree")]);
       const grid = document.getElementById("stats-grid");
       grid.innerHTML = `
           <div class="stat-card"><div class="stat-number">${stats.total_members}</div><div class="stat-label">Tổng thành viên</div></div>
           <div class="stat-card"><div class="stat-number">${stats.alive}</div><div class="stat-label">Còn sống</div></div>
           <div class="stat-card"><div class="stat-number">${stats.deceased}</div><div class="stat-label">Đã mất</div></div>
           <div class="stat-card"><div class="stat-number">${countRecordedGenerations(treeData)}</div><div class="stat-label">Số đời đã ghi nhận</div></div>
       `;
   
       const events = await apiGet("/events");
       const wrap = document.getElementById("upcoming-events");
       if (events.length === 0) {
           wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div>Chưa có sự kiện nào được ghi nhận.</div>`;
       } else {
           // Backend đã sắp theo ngày sắp tới gần nhất -> chỉ hiện vài sự kiện gần nhất
           wrap.innerHTML = `<ul class="relation-list">` + events.slice(0, 6).map(e => `
               <li>
                   <span><strong>${e.full_name}</strong> — ${eventTypeLabel(e.event_type)} (${formatDateVN(e.event_date) || "chưa rõ ngày"}, ${e.calendar_type === "lunar" ? "âm lịch" : "dương lịch"})</span>
               </li>
           `).join("") + `</ul>`;
       }
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
                   <p><strong>Ngày sinh:</strong> ${formatDateVN(person.birth_date) || "chưa rõ"} ${person.birth_date_note ? `(${escapeHtml(person.birth_date_note)})` : ""}</p>
                   <p><strong>Nơi sinh:</strong> ${escapeHtml(person.birth_place) || "—"}</p>
                   <p><strong>Nghề nghiệp:</strong> ${escapeHtml(person.occupation) || "—"}</p>
                   ${!person.is_alive ? `<p><strong>Ngày mất:</strong> ${formatDateVN(person.death_date) || "chưa rõ"} ${person.death_date_note ? `(${escapeHtml(person.death_date_note)})` : ""}</p>` : ""}
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
   let lastEventsData = [];
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
           list.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div>${msg}</div>`;
           return;
       }
       list.innerHTML = `
           <table class="data-table">
               <thead><tr><th>Người liên quan</th><th>Loại</th><th>Ngày</th><th>Lịch</th><th>Mô tả</th><th></th></tr></thead>
               <tbody>
                   ${events.map(e => `
                       <tr>
                           <td>${e.full_name}</td>
                           <td>${eventTypeLabel(e.event_type)}${e.auto ? ` <span class="event-auto-badge" title="Tự động lấy từ ngày sinh/ngày mất trong hồ sơ">Tự động</span>` : ""}</td>
                           <td>${formatDateVN(e.event_date) || "—"}</td>
                           <td>${e.calendar_type === "lunar" ? "Âm lịch" : "Dương lịch"}</td>
                           <td>${e.description || "—"}</td>
                           <td>${e.auto ? "" : `<button class="btn-secondary btn" onclick="deleteEvent(${e.id})">Xóa</button>`}</td>
                       </tr>
                   `).join("")}
               </tbody>
           </table>
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
   // TAB: CÂY GIA PHẢ
   // ------------------------------------------------------------
   // THUẬT TOÁN BỐ CỤC: đệ quy từ gốc xuống (kiểu Reingold-Tilford rút gọn).
   // Ý tưởng cốt lõi để tránh lỗi "con cùng cha/mẹ bị xen bởi nhánh khác":
   //   1) Duyệt cây THẬT (mỗi người chỉ đứng ở đúng 1 vị trí), không xếp
   //      từng "hàng" độc lập rồi vá lỗi chồng lấn như bản cũ.
   //   2) Mỗi nhánh (1 người/1 cặp vợ chồng + toàn bộ hậu duệ của họ) được
   //      cấp riêng 1 "băng ngang" (khoảng x cố định) — không nhánh nào
   //      được phép lấn sang băng của nhánh khác. Vì vậy anh chị em ruột
   //      (chung cha/mẹ) LUÔN nằm cạnh nhau, tuyệt đối không bị xen.
   //   3) Độ rộng mỗi băng = tính từ DƯỚI LÊN (con cháu quyết định băng
   //      cha/mẹ cần rộng bao nhiêu), rồi gán toạ độ TỪ TRÊN XUỐNG.
   // ============================================================
   const NODE_W = 190;
   const NODE_H = 68;
   const NODE_H_MERGED = 82; // Thẻ gộp vợ/chồng cao hơn để chứa thêm 1 dòng tên
   const H_GAP = 46;
   const V_GAP = 120;
   const NODE_TOP = 40;
   const NODE_AVATAR_R = 20;
   const NODE_TEXT_X = 64;
   
   // Chế độ hiển thị vợ/chồng trên cây:
   //   'separate' = vợ/chồng là 2 thẻ riêng, nối bằng 1 đường kèm chấm tròn
   //   'merged'   = vợ/chồng gộp chung 1 thẻ (thẻ của người huyết thống, vợ/chồng hiện nhỏ bên trong)
   let treeDisplayMode = "separate";
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
.tree-node-card.deceased { opacity: 0.72; }
.tree-node-card rect.card-bg { fill: #FBF5E7; stroke: #B8935A; stroke-width: 1.2; }
.tree-node-card text.node-name { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 13.5px; font-weight: 600; fill: #2B2118; }
.tree-node-card text.node-years { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 11.5px; fill: #6B5D48; }
.tree-node-card text.node-avatar-letter { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-weight: 600; fill: #FBF5E7; text-anchor: middle; dominant-baseline: central; }
.tree-node-card text.gen-label { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 9.5px; font-weight: 600; fill: #8B2635; text-anchor: middle; }
.edge-line { stroke: #B8935A; stroke-width: 1.6; fill: none; }
.marriage-line { stroke: #8B2635; stroke-width: 2; fill: none; }
.marriage-dot { fill: #8B2635; }
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
   
   function setTreeDisplayMode(mode) {
       if (treeDisplayMode === mode) return;
       treeDisplayMode = mode;
       document.querySelectorAll(".tree-mode-btn").forEach((b) => {
           b.classList.toggle("active", b.dataset.mode === mode);
       });
       if (lastTreeData) drawTree(lastTreeData, lastTreeRootId);
   }
   
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
        ctx.fillStyle = "#FBF5E7";
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
document.getElementById("btn-tree-export-pdf").addEventListener("click", () => exportTreePdfViaPrint());

   document.querySelectorAll(".tree-mode-btn").forEach((btn) => {
       btn.addEventListener("click", () => setTreeDisplayMode(btn.dataset.mode));
   });
   
   function drawTree(data, rootId) {
       lastTreeRootId = rootId;
       const { persons, parent_child, marriages } = data;
       const byId = Object.fromEntries(persons.map((p) => [p.id, p]));
   
       const childrenOf = {};
       const parentsOf = {};
       parent_child.forEach((link) => {
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
   
       const generation = treeComputeGenerations(persons, parent_child, marriages, visibleIds, parentsOf);
   
       // ============================================================
       // BƯỚC 1: DUYỆT TỪ GỐC XUỐNG, DỰNG CÂY THẬT (mỗi người/cặp = 1 "unit")
       // ============================================================
       const placed = new Set(); // người đã được gán vào 1 vị trí trên cây
   
       function findSpouseUnplaced(id) {
           const rel = marriages.find(
               (m) =>
                   ((m.person1_id === id && visibleIds.has(m.person2_id)) ||
                       (m.person2_id === id && visibleIds.has(m.person1_id))) &&
                   generation[m.person1_id] === generation[m.person2_id]
           );
           if (!rel) return null;
           const spouseId = rel.person1_id === id ? rel.person2_id : rel.person1_id;
           return placed.has(spouseId) ? null : spouseId;
       }
   
       // bloodId = người thuộc huyết thống (đến từ cha/mẹ); nếu có vợ/chồng thì gộp thành 1 "unit"
       function makeUnit(bloodId) {
           if (placed.has(bloodId)) return null;
           placed.add(bloodId);
           const spouseId = findSpouseUnplaced(bloodId);
           if (spouseId != null) placed.add(spouseId);
           return spouseId != null
               ? { type: "couple", ids: [bloodId, spouseId] } // ids[0] luôn là người huyết thống
               : { type: "single", ids: [bloodId] };
       }
   
       function childIdsOfUnit(unit) {
           const set = new Set();
           unit.ids.forEach((pid) => (childrenOf[pid] || []).forEach((cid) => {
               if (visibleIds.has(cid) && !placed.has(cid)) set.add(cid);
           }));
           return [...set].sort((a, b) => byId[a].full_name.localeCompare(byId[b].full_name));
       }
   
       function buildNode(unit) {
           const children = [];
           childIdsOfUnit(unit).forEach((cid) => {
               const cu = makeUnit(cid);
               if (cu) children.push(buildNode(cu));
           });
           return { unit, children };
       }
   
       // Gốc: người hiển thị nhưng không có cha/mẹ nào cũng đang hiển thị
       const rootIds = persons
           .filter((p) => visibleIds.has(p.id) && !(parentsOf[p.id] || []).some((pid) => visibleIds.has(pid)))
           .sort((a, b) => byId[a.id].full_name.localeCompare(byId[b.id].full_name))
           .map((p) => p.id);
   
       const forest = [];
       rootIds.forEach((id) => {
           const u = makeUnit(id);
           if (u) forest.push(buildNode(u));
       });
       // An toàn: nếu còn ai chưa được xếp (trường hợp dữ liệu vòng lặp hiếm gặp), thêm làm gốc lẻ
       persons.filter((p) => visibleIds.has(p.id) && !placed.has(p.id)).forEach((p) => {
           const u = makeUnit(p.id);
           if (u) forest.push(buildNode(u));
       });
   
       // ============================================================
       // BƯỚC 2: TÍNH ĐỘ RỘNG BĂNG CỦA MỖI NHÁNH (đệ quy TỪ DƯỚI LÊN)
       // ============================================================
       function unitWidth(unit) {
           if (treeDisplayMode === "merged") return NODE_W;
           return unit.type === "couple" ? NODE_W * 2 + H_GAP : NODE_W;
       }
       function computeWidth(node) {
           const uw = unitWidth(node.unit);
           if (node.children.length === 0) return (node.width = uw);
           const childrenTotal = node.children.reduce((s, c) => s + computeWidth(c), 0) + (node.children.length - 1) * H_GAP;
           return (node.width = Math.max(uw, childrenTotal));
       }
       forest.forEach(computeWidth);
   
       // ============================================================
       // BƯỚC 3: GÁN TOẠ ĐỘ X (đệ quy TỪ TRÊN XUỐNG) — mỗi nhánh nằm gọn
       // trong băng đã tính, không bao giờ lấn sang băng của nhánh khác.
       // ============================================================
       const posX = {};
       function assignX(node, leftX) {
           if (node.children.length > 0) {
               const childrenTotal = node.children.reduce((s, c) => s + c.width, 0) + (node.children.length - 1) * H_GAP;
               let cursor = leftX + (node.width - childrenTotal) / 2;
               node.children.forEach((c) => {
                   assignX(c, cursor);
                   cursor += c.width + H_GAP;
               });
               node.centerX = (node.children[0].centerX + node.children[node.children.length - 1].centerX) / 2;
           } else {
               node.centerX = leftX + node.width / 2;
           }
           if (node.unit.type === "couple" && treeDisplayMode === "separate") {
               const leftEdge = node.centerX - unitWidth(node.unit) / 2;
               posX[node.unit.ids[0]] = leftEdge;
               posX[node.unit.ids[1]] = leftEdge + NODE_W + H_GAP;
           } else {
               posX[node.unit.ids[0]] = node.centerX - NODE_W / 2;
               if (node.unit.type === "couple") posX[node.unit.ids[1]] = posX[node.unit.ids[0]];
           }
       }
       let cursorX = 0;
       forest.forEach((node) => {
           assignX(node, cursorX);
           cursorX += node.width + H_GAP * 2; // khoảng cách rộng hơn giữa các cây/nhánh gốc độc lập
       });
   
       const contentWidth = Math.max(0, cursorX - H_GAP * 2);
       const canvasWidth = Math.max(contentWidth + 80, 900);
       const offsetX = (canvasWidth - contentWidth) / 2;
       Object.keys(posX).forEach((id) => (posX[id] += offsetX));
   
       const maxGen = persons.filter((p) => visibleIds.has(p.id)).reduce((m, p) => Math.max(m, generation[p.id]), 0);
       const canvasHeight = (maxGen + 1) * V_GAP + NODE_H_MERGED + 40;
    const scaledWidth = Math.ceil(canvasWidth * treeScale);
    const scaledHeight = Math.ceil(canvasHeight * treeScale);
   
       // ============================================================
       // BƯỚC 4: VẼ SVG (đường nối trước, thẻ người sau)
       // ============================================================
       function nodeUnitY(unit) { return generation[unit.ids[0]] * V_GAP + NODE_TOP; }
       function nodeHeight() { return treeDisplayMode === "merged" ? NODE_H_MERGED : NODE_H; }
       function nodeCenterXOf(unit) {
           if (treeDisplayMode === "merged" || unit.type === "single") return posX[unit.ids[0]] + NODE_W / 2;
           return (posX[unit.ids[0]] + NODE_W / 2 + posX[unit.ids[1]] + NODE_W / 2) / 2;
       }
   
       let svgDefs = "<defs>";
       persons.filter((p) => visibleIds.has(p.id) && p.avatar_path).forEach((p) => {
           svgDefs += `<clipPath id="clip-${p.id}"><circle cx="0" cy="0" r="${NODE_AVATAR_R}" /></clipPath>`;
       });
       svgDefs += "</defs>";
       const svgParts = [`<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">${svgDefs}<style>${TREE_SVG_STYLE}</style>`];
   
       function drawConnectors(node) {
           if (node.unit.type === "couple" && treeDisplayMode === "separate") {
               const [a, b] = node.unit.ids;
               const y = generation[a] * V_GAP + NODE_TOP + NODE_H / 2;
               const x1 = posX[a] + NODE_W - 8;
               const x2 = posX[b] + 8;
               if (x2 > x1) {
                   svgParts.push(`<line class="marriage-line" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" />`);
                   svgParts.push(`<circle class="marriage-dot" cx="${(x1 + x2) / 2}" cy="${y}" r="6" />`);
               }
           }
           if (node.children.length > 0) {
               const parentY = nodeUnitY(node.unit) + nodeHeight();
               const childY = nodeUnitY(node.children[0].unit);
               const anchorX = nodeCenterXOf(node.unit);
               const forkY = parentY + (childY - parentY) * 0.5;
               if (node.children.length === 1) {
                   const cx = nodeCenterXOf(node.children[0].unit);
                   svgParts.push(`<path class="edge-line" d="M ${anchorX} ${parentY} L ${anchorX} ${forkY} L ${cx} ${forkY} L ${cx} ${childY}" />`);
               } else {
                   const centers = node.children.map((c) => nodeCenterXOf(c.unit));
                   const leftX = Math.min(...centers);
                   const rightX = Math.max(...centers);
                   svgParts.push(`<path class="edge-line" d="M ${anchorX} ${parentY} L ${anchorX} ${forkY} L ${leftX} ${forkY} L ${rightX} ${forkY}" />`);
                   centers.forEach((cx) => svgParts.push(`<path class="edge-line" d="M ${cx} ${forkY} L ${cx} ${childY}" />`));
               }
               node.children.forEach(drawConnectors);
           }
       }
       forest.forEach(drawConnectors);
   
       function drawAvatar(p, cx, cy, r) {
           const genderColor = treeGenderColor(p.gender);
           if (p.avatar_path) {
               return `
                   <circle cx="${cx}" cy="${cy}" r="${r}" fill="${genderColor}" />
                   <g transform="translate(${cx}, ${cy})">
                       <image href="/uploads/${p.avatar_path}" x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}"
                           clip-path="url(#clip-${p.id})" preserveAspectRatio="xMidYMid slice" />
                   </g>`;
           }
           return `
               <circle cx="${cx}" cy="${cy}" r="${r}" fill="${genderColor}" />
               <text class="node-avatar-letter" x="${cx}" y="${cy}" text-anchor="middle" font-size="${Math.round(r * 0.75)}">${escapeHtml(treeAvatarInitial(p.full_name))}</text>`;
       }
   
       function drawNode(node) {
           const unit = node.unit;
           const y = nodeUnitY(unit);
   
           if (unit.type === "single" || treeDisplayMode === "separate") {
               unit.ids.forEach((pid) => {
                   const p = byId[pid];
                   const x = posX[pid];
                   const alive = p.is_alive === 1 || p.is_alive === true;
                   svgParts.push(`
                       <g class="tree-node-card${alive ? "" : " deceased"}" onclick="openDetailFromTree(${p.id})">
                           <rect class="card-bg" x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8" />
                           ${drawAvatar(p, x + 34, y + NODE_H / 2, NODE_AVATAR_R)}
                           <text class="node-name" x="${x + NODE_TEXT_X}" y="${y + 27}">${escapeHtml(truncate(p.full_name, 18))}</text>
                           <text class="node-years" x="${x + NODE_TEXT_X}" y="${y + 45}">${formatTreeYears(p)}</text>
                           <rect x="${x + NODE_W - 58}" y="${y + NODE_H - 22}" width="50" height="16" rx="8" fill="rgba(139,38,53,0.1)" />
                           <text class="gen-label" x="${x + NODE_W - 33}" y="${y + NODE_H - 10}">Đời ${generation[pid]}</text>
                       </g>
                   `);
               });
           } else {
               // Chế độ gộp: 1 thẻ chung cho cả cặp — ids[0] là người huyết thống (hiển thị chính)
               const [primaryId, spouseId] = unit.ids;
               const primary = byId[primaryId];
               const spouse = byId[spouseId];
               const x = posX[primaryId];
               const h = NODE_H_MERGED;
               const alive = primary.is_alive === 1 || primary.is_alive === true;
               svgParts.push(`
                   <g class="tree-node-card${alive ? "" : " deceased"}" onclick="openDetailFromTree(${primary.id})">
                       <rect class="card-bg" x="${x}" y="${y}" width="${NODE_W}" height="${h}" rx="8" />
                       ${drawAvatar(primary, x + 28, y + 27, 15)}
                       ${drawAvatar(spouse, x + 28, y + 56, 12)}
                       <text class="node-name" x="${x + 54}" y="${y + 23}">${escapeHtml(truncate(primary.full_name, 16))}</text>
                       <text class="node-spouse-name" x="${x + 54}" y="${y + 40}">&amp; ${escapeHtml(truncate(spouse.full_name, 16))}</text>
                       <text class="node-years" x="${x + 54}" y="${y + 58}">${formatTreeYears(primary)}</text>
                       <rect x="${x + NODE_W - 58}" y="${y + h - 22}" width="50" height="16" rx="8" fill="rgba(139,38,53,0.1)" />
                       <text class="gen-label" x="${x + NODE_W - 33}" y="${y + h - 10}">Đời ${generation[primaryId]}</text>
                   </g>
               `);
           }
           node.children.forEach(drawNode);
       }
       forest.forEach(drawNode);
   
       svgParts.push("</svg>");
       const svg = svgParts.join("");
       lastTreeExport = { svg, canvasWidth, canvasHeight };

       const wrap = document.getElementById("tree-canvas-wrap");
    updateTreeZoomLabel();
       if (persons.filter((p) => visibleIds.has(p.id)).length === 0) {
           wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⌂</div>Chưa có dữ liệu để vẽ cây gia phả. Hãy thêm thành viên và thiết lập quan hệ trước.</div>`;
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