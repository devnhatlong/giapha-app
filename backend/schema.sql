-- ============================================================
-- SCHEMA CƠ SỞ DỮ LIỆU GIA PHẢ
-- Dùng SQLite: toàn bộ database chỉ là 1 file .db, không cần server.
-- ============================================================

-- Bảng THÀNH VIÊN: bảng trung tâm, mỗi dòng là 1 người trong dòng họ
CREATE TABLE IF NOT EXISTS persons (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name       TEXT NOT NULL,              -- Họ tên đầy đủ
    nickname        TEXT,                        -- Tên gọi khác / biệt danh
    gender          TEXT CHECK(gender IN ('male','female','other')) DEFAULT 'other',
    birth_date      TEXT,                        -- Lưu dạng 'YYYY-MM-DD', có thể để trống nếu không rõ
    birth_date_note TEXT,                        -- VD: "âm lịch", "khoảng năm 1950", "không rõ ngày"
    death_date      TEXT,
    death_date_note TEXT,
    is_alive        INTEGER DEFAULT 1,           -- 1 = còn sống, 0 = đã mất
    birth_place     TEXT,
    occupation      TEXT,                        -- Nghề nghiệp
    biography       TEXT,                        -- Tiểu sử / ghi chú dài
    avatar_path     TEXT,                        -- Đường dẫn ảnh đại diện (lưu trong thư mục uploads)
    generation      INTEGER,                     -- Đời thứ mấy (có thể tự tính hoặc nhập tay)
    created_at      TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at      TEXT DEFAULT (datetime('now', 'localtime'))
);

-- Bảng QUAN HỆ CHA/MẸ - CON: mỗi dòng là 1 liên kết "parent_id là cha/mẹ của child_id"
-- Một người con có thể có 2 dòng (1 cho cha, 1 cho mẹ)
CREATE TABLE IF NOT EXISTS parent_child (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id       INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    child_id        INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    relation_type   TEXT DEFAULT 'biological',   -- 'biological' (ruột) hoặc 'adopted' (nuôi)
    UNIQUE(parent_id, child_id)
);

-- Bảng HÔN NHÂN: vợ - chồng, hỗ trợ tái hôn (1 người có thể xuất hiện nhiều dòng)
CREATE TABLE IF NOT EXISTS marriages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    person1_id      INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    person2_id      INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    marriage_date   TEXT,
    divorce_date    TEXT,
    status          TEXT CHECK(status IN ('married','divorced','widowed')) DEFAULT 'married',
    note            TEXT,
    UNIQUE(person1_id, person2_id)
);

-- Bảng SỰ KIỆN: ngày giỗ, ngày kỵ, sự kiện quan trọng gắn với 1 người
CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id       INTEGER REFERENCES persons(id) ON DELETE CASCADE,
    event_type      TEXT DEFAULT 'custom',       -- 'death_anniversary', 'birthday', 'custom'
    event_date      TEXT,                         -- Ngày (dương hoặc âm tùy calendar_type)
    calendar_type   TEXT CHECK(calendar_type IN ('solar','lunar')) DEFAULT 'solar',
    description     TEXT,
    recurring       INTEGER DEFAULT 1             -- 1 = lặp lại hàng năm
);

-- Bảng TÀI LIỆU/ẢNH đính kèm cho từng người (ngoài ảnh đại diện)
CREATE TABLE IF NOT EXISTS media (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id       INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,
    file_type       TEXT,                         -- 'image', 'document'
    caption         TEXT,
    uploaded_at     TEXT DEFAULT (datetime('now', 'localtime'))
);

-- Bảng CÀI ĐẶT: lưu avatar gia phả, tên dòng họ, v.v.
CREATE TABLE IF NOT EXISTS settings (
    key     TEXT PRIMARY KEY,
    value   TEXT
);

-- Index giúp tìm kiếm/truy vấn nhanh hơn khi dữ liệu lớn dần
CREATE INDEX IF NOT EXISTS idx_parent ON parent_child(parent_id);
CREATE INDEX IF NOT EXISTS idx_child ON parent_child(child_id);
CREATE INDEX IF NOT EXISTS idx_person_name ON persons(full_name);
