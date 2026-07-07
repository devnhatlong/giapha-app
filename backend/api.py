"""
api.py
------
Đây là "bộ não" xử lý logic của ứng dụng.
FastAPI giúp ta định nghĩa các "đường dẫn" (endpoint), ví dụ:
  GET  /api/persons        -> lấy danh sách tất cả thành viên
  POST /api/persons        -> thêm 1 thành viên mới
Giao diện (frontend) sẽ gọi tới các đường dẫn này để lấy/gửi dữ liệu.
"""

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os

from . import database

app = FastAPI(title="API Gia Phả")

# Cho phép giao diện (chạy trong pywebview) gọi được API này
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(database.PROJECT_ROOT, "uploads")
PERSONS_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "persons")
FAMILY_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "family")
os.makedirs(PERSONS_UPLOAD_DIR, exist_ok=True)
os.makedirs(FAMILY_UPLOAD_DIR, exist_ok=True)

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024


def _validate_image(file: UploadFile) -> str:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Tên file không hợp lệ")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận ảnh JPG, PNG, WEBP, GIF")
    return ext


def _delete_file_if_exists(relative_path: Optional[str]):
    if not relative_path:
        return
    full = os.path.join(UPLOAD_DIR, relative_path.replace("/", os.sep))
    if os.path.isfile(full):
        os.remove(full)


def _get_setting(conn, key: str) -> Optional[str]:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def _set_setting(conn, key: str, value: Optional[str]):
    if value is None:
        conn.execute("DELETE FROM settings WHERE key = ?", (key,))
    else:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


# ============================================================
# ĐỊNH NGHĨA "HÌNH DẠNG" DỮ LIỆU (Pydantic models)
# Giúp FastAPI tự kiểm tra dữ liệu gửi lên có đúng định dạng không
# ============================================================

class PersonIn(BaseModel):
    full_name: str
    nickname: Optional[str] = None
    gender: Optional[str] = "other"
    birth_date: Optional[str] = None
    birth_date_note: Optional[str] = None
    death_date: Optional[str] = None
    death_date_note: Optional[str] = None
    is_alive: Optional[int] = 1
    birth_place: Optional[str] = None
    occupation: Optional[str] = None
    biography: Optional[str] = None
    generation: Optional[int] = None


class ParentChildIn(BaseModel):
    parent_id: int
    child_id: int
    relation_type: Optional[str] = "biological"


class MarriageIn(BaseModel):
    person1_id: int
    person2_id: int
    marriage_date: Optional[str] = None
    divorce_date: Optional[str] = None
    status: Optional[str] = "married"
    note: Optional[str] = None


class EventIn(BaseModel):
    person_id: int
    event_type: Optional[str] = "custom"
    event_date: Optional[str] = None
    calendar_type: Optional[str] = "solar"
    description: Optional[str] = None
    recurring: Optional[int] = 1


# ============================================================
# API: THÀNH VIÊN (persons)
# ============================================================

@app.get("/api/persons")
def list_persons(search: Optional[str] = None):
    """Lấy danh sách thành viên. Nếu có 'search', lọc theo tên."""
    conn = database.get_connection()
    try:
        if search:
            rows = conn.execute(
                "SELECT * FROM persons WHERE full_name LIKE ? OR nickname LIKE ? ORDER BY generation, full_name",
                (f"%{search}%", f"%{search}%"),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM persons ORDER BY generation, full_name").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/persons/{person_id}")
def get_person(person_id: int):
    conn = database.get_connection()
    try:
        row = conn.execute("SELECT * FROM persons WHERE id = ?", (person_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")
        person = dict(row)

        # Lấy thêm thông tin liên quan: cha mẹ, con cái, vợ/chồng, sự kiện, ảnh
        parents = conn.execute("""
            SELECT p.* FROM persons p
            JOIN parent_child pc ON pc.parent_id = p.id
            WHERE pc.child_id = ?
        """, (person_id,)).fetchall()

        children = conn.execute("""
            SELECT p.* FROM persons p
            JOIN parent_child pc ON pc.child_id = p.id
            WHERE pc.parent_id = ?
        """, (person_id,)).fetchall()

        spouses = conn.execute("""
            SELECT p.*, m.status, m.marriage_date, m.id as marriage_id FROM persons p
            JOIN marriages m ON (
                (m.person1_id = ? AND m.person2_id = p.id) OR
                (m.person2_id = ? AND m.person1_id = p.id)
            )
        """, (person_id, person_id)).fetchall()

        events = conn.execute("SELECT * FROM events WHERE person_id = ?", (person_id,)).fetchall()
        media = conn.execute("SELECT * FROM media WHERE person_id = ?", (person_id,)).fetchall()

        person["parents"] = [dict(r) for r in parents]
        person["children"] = [dict(r) for r in children]
        person["spouses"] = [dict(r) for r in spouses]
        person["events"] = [dict(r) for r in events]
        person["media"] = [dict(r) for r in media]
        return person
    finally:
        conn.close()


@app.post("/api/persons")
def create_person(person: PersonIn):
    conn = database.get_connection()
    try:
        cur = conn.execute("""
            INSERT INTO persons (full_name, nickname, gender, birth_date, birth_date_note,
                death_date, death_date_note, is_alive, birth_place, occupation, biography, generation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            person.full_name, person.nickname, person.gender, person.birth_date, person.birth_date_note,
            person.death_date, person.death_date_note, person.is_alive, person.birth_place,
            person.occupation, person.biography, person.generation
        ))
        conn.commit()
        return {"id": cur.lastrowid}
    finally:
        conn.close()


@app.put("/api/persons/{person_id}")
def update_person(person_id: int, person: PersonIn):
    conn = database.get_connection()
    try:
        existing = conn.execute("SELECT id FROM persons WHERE id = ?", (person_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")
        conn.execute("""
            UPDATE persons SET full_name=?, nickname=?, gender=?, birth_date=?, birth_date_note=?,
                death_date=?, death_date_note=?, is_alive=?, birth_place=?, occupation=?, biography=?,
                generation=?, updated_at=datetime('now','localtime')
            WHERE id=?
        """, (
            person.full_name, person.nickname, person.gender, person.birth_date, person.birth_date_note,
            person.death_date, person.death_date_note, person.is_alive, person.birth_place,
            person.occupation, person.biography, person.generation, person_id
        ))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.delete("/api/persons/{person_id}")
def delete_person(person_id: int):
    conn = database.get_connection()
    try:
        row = conn.execute("SELECT avatar_path FROM persons WHERE id = ?", (person_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")
        _delete_file_if_exists(row["avatar_path"])
        conn.execute("DELETE FROM persons WHERE id = ?", (person_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.post("/api/persons/{person_id}/avatar")
async def upload_person_avatar(person_id: int, file: UploadFile = File(...)):
    ext = _validate_image(file)
    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Ảnh không được vượt quá 5MB")

    conn = database.get_connection()
    try:
        row = conn.execute("SELECT id, avatar_path FROM persons WHERE id = ?", (person_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")

        relative_path = f"persons/{person_id}{ext}"
        full_path = os.path.join(UPLOAD_DIR, relative_path.replace("/", os.sep))
        _delete_file_if_exists(row["avatar_path"])
        with open(full_path, "wb") as f:
            f.write(content)

        conn.execute(
            "UPDATE persons SET avatar_path = ?, updated_at = datetime('now','localtime') WHERE id = ?",
            (relative_path, person_id),
        )
        conn.commit()
        return {"avatar_path": relative_path}
    finally:
        conn.close()


@app.delete("/api/persons/{person_id}/avatar")
def delete_person_avatar(person_id: int):
    conn = database.get_connection()
    try:
        row = conn.execute("SELECT avatar_path FROM persons WHERE id = ?", (person_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")
        _delete_file_if_exists(row["avatar_path"])
        conn.execute(
            "UPDATE persons SET avatar_path = NULL, updated_at = datetime('now','localtime') WHERE id = ?",
            (person_id,),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ============================================================
# API: CÀI ĐẶT GIA PHẢ (avatar, tên dòng họ)
# ============================================================

@app.get("/api/settings")
def get_settings():
    conn = database.get_connection()
    try:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        return {r["key"]: r["value"] for r in rows}
    finally:
        conn.close()


@app.post("/api/settings/family-avatar")
async def upload_family_avatar(file: UploadFile = File(...)):
    ext = _validate_image(file)
    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Ảnh không được vượt quá 5MB")

    conn = database.get_connection()
    try:
        old_path = _get_setting(conn, "family_avatar_path")
        relative_path = f"family/logo{ext}"
        full_path = os.path.join(UPLOAD_DIR, relative_path.replace("/", os.sep))
        _delete_file_if_exists(old_path)
        with open(full_path, "wb") as f:
            f.write(content)
        _set_setting(conn, "family_avatar_path", relative_path)
        conn.commit()
        return {"family_avatar_path": relative_path}
    finally:
        conn.close()


@app.delete("/api/settings/family-avatar")
def delete_family_avatar():
    conn = database.get_connection()
    try:
        old_path = _get_setting(conn, "family_avatar_path")
        _delete_file_if_exists(old_path)
        _set_setting(conn, "family_avatar_path", None)
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ============================================================
# API: QUAN HỆ CHA/MẸ - CON
# ============================================================

@app.post("/api/relationships/parent-child")
def add_parent_child(rel: ParentChildIn):
    if rel.parent_id == rel.child_id:
        raise HTTPException(status_code=400, detail="Một người không thể là cha/mẹ của chính mình")
    conn = database.get_connection()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO parent_child (parent_id, child_id, relation_type) VALUES (?, ?, ?)",
            (rel.parent_id, rel.child_id, rel.relation_type),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.delete("/api/relationships/parent-child")
def remove_parent_child(parent_id: int, child_id: int):
    conn = database.get_connection()
    try:
        conn.execute(
            "DELETE FROM parent_child WHERE parent_id = ? AND child_id = ?", (parent_id, child_id)
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ============================================================
# API: HÔN NHÂN
# ============================================================

@app.post("/api/relationships/marriage")
def add_marriage(m: MarriageIn):
    conn = database.get_connection()
    try:
        cur = conn.execute("""
            INSERT OR IGNORE INTO marriages (person1_id, person2_id, marriage_date, divorce_date, status, note)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (m.person1_id, m.person2_id, m.marriage_date, m.divorce_date, m.status, m.note))
        conn.commit()
        return {"id": cur.lastrowid}
    finally:
        conn.close()


@app.delete("/api/relationships/marriage/{marriage_id}")
def remove_marriage(marriage_id: int):
    conn = database.get_connection()
    try:
        conn.execute("DELETE FROM marriages WHERE id = ?", (marriage_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ============================================================
# API: SỰ KIỆN (ngày giỗ, sự kiện quan trọng)
# ============================================================

@app.get("/api/events")
def list_events():
    conn = database.get_connection()
    try:
        rows = conn.execute("""
            SELECT e.*, p.full_name FROM events e
            JOIN persons p ON p.id = e.person_id
            ORDER BY e.event_date
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/api/events")
def create_event(ev: EventIn):
    conn = database.get_connection()
    try:
        cur = conn.execute("""
            INSERT INTO events (person_id, event_type, event_date, calendar_type, description, recurring)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (ev.person_id, ev.event_type, ev.event_date, ev.calendar_type, ev.description, ev.recurring))
        conn.commit()
        return {"id": cur.lastrowid}
    finally:
        conn.close()


@app.delete("/api/events/{event_id}")
def delete_event(event_id: int):
    conn = database.get_connection()
    try:
        conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ============================================================
# API: CÂY GIA PHẢ (dữ liệu để vẽ sơ đồ)
# ============================================================

@app.get("/api/tree")
def get_tree(root_id: Optional[int] = None):
    """
    Trả về toàn bộ dữ liệu người + quan hệ cha/mẹ-con + hôn nhân,
    để frontend tự dựng sơ đồ cây bằng JavaScript (SVG).
    Nếu có root_id, frontend có thể lọc chỉ hiển thị nhánh từ người đó trở xuống.
    """
    conn = database.get_connection()
    try:
        persons = [dict(r) for r in conn.execute("SELECT * FROM persons").fetchall()]
        links = [dict(r) for r in conn.execute("SELECT parent_id, child_id FROM parent_child").fetchall()]
        marriages = [dict(r) for r in conn.execute(
            "SELECT person1_id, person2_id, status FROM marriages"
        ).fetchall()]
        return {"persons": persons, "parent_child": links, "marriages": marriages, "root_id": root_id}
    finally:
        conn.close()


# ============================================================
# API: THỐNG KÊ NHANH (cho trang tổng quan)
# ============================================================

@app.get("/api/stats")
def get_stats():
    conn = database.get_connection()
    try:
        total = conn.execute("SELECT COUNT(*) c FROM persons").fetchone()["c"]
        alive = conn.execute("SELECT COUNT(*) c FROM persons WHERE is_alive = 1").fetchone()["c"]
        generations = conn.execute(
            "SELECT COUNT(DISTINCT generation) c FROM persons WHERE generation IS NOT NULL"
        ).fetchone()["c"]
        return {"total_members": total, "alive": alive, "deceased": total - alive, "generations": generations}
    finally:
        conn.close()
