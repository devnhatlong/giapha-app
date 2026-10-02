"""
backup.py
---------
Sao lưu / khôi phục TOÀN BỘ dữ liệu gia phả ra 1 file .zip để chuyển sang máy khác
(phần mềm chạy offline -> người dùng tự chép file qua USB, Zalo, email...).

File sao lưu gồm:
    manifest.json   <- đánh dấu đây là file sao lưu Gia Phả + thời điểm tạo
    giapha.db       <- database (chụp bằng SQLite backup API nên luôn nhất quán)
    uploads/...     <- ảnh đại diện, tài liệu đính kèm

KHÔNG gồm license.dat: bản quyền gắn với từng máy, máy mới phải kích hoạt riêng.
"""

import json
import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime

from . import database

APP_ID = "GiaPha"
FORMAT_VERSION = 1
REQUIRED_TABLES = {"persons", "parent_child", "marriages", "events"}
# Bản sao lưu tự động trước mỗi lần khôi phục (phòng khi chọn nhầm file)
AUTO_BACKUP_DIR = os.path.join(database.USER_DATA_ROOT, "backups")


def default_filename() -> str:
    return f"GiaPha-SaoLuu-{datetime.now().strftime('%Y-%m-%d_%H%M')}.zip"


def _snapshot_db(dest_path: str):
    """Chụp database ra file khác bằng backup API (an toàn kể cả khi app đang dùng DB)."""
    src = sqlite3.connect(database.DB_PATH)
    dst = sqlite3.connect(dest_path)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()


def _count_members(db_path: str) -> int:
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute("SELECT COUNT(*) FROM persons").fetchone()[0]
    finally:
        conn.close()


def create_backup(zip_path: str) -> dict:
    """Ghi toàn bộ dữ liệu ra zip_path. Trả về {"members": số thành viên, "files": số file ảnh}."""
    with tempfile.TemporaryDirectory() as tmp:
        db_copy = os.path.join(tmp, "giapha.db")
        _snapshot_db(db_copy)
        members = _count_members(db_copy)

        # Ghi ra file tạm rồi mới đổi tên -> không để lại file .zip dở dang nếu lỗi giữa chừng
        tmp_zip = zip_path + ".tmp"
        files = 0
        try:
            with zipfile.ZipFile(tmp_zip, "w", zipfile.ZIP_DEFLATED) as zf:
                zf.writestr("manifest.json", json.dumps({
                    "app": APP_ID,
                    "format": FORMAT_VERSION,
                    "created_at": datetime.now().isoformat(timespec="seconds"),
                    "members": members,
                }, ensure_ascii=False, indent=2))
                zf.write(db_copy, "giapha.db")
                for root, _dirs, names in os.walk(database.UPLOAD_DIR):
                    for name in names:
                        full = os.path.join(root, name)
                        rel = os.path.relpath(full, database.UPLOAD_DIR).replace(os.sep, "/")
                        zf.write(full, f"uploads/{rel}")
                        files += 1
            os.replace(tmp_zip, zip_path)
        finally:
            if os.path.exists(tmp_zip):
                os.remove(tmp_zip)
    return {"members": members, "files": files}


def _safe_upload_member(name: str):
    """Trả về đường dẫn tương đối an toàn trong uploads/, hoặc None (chặn ../ , đường dẫn tuyệt đối)."""
    if not name.startswith("uploads/") or name.endswith("/"):
        return None
    rel = os.path.normpath(name[len("uploads/"):])
    if rel.startswith("..") or os.path.isabs(rel) or ":" in rel:
        return None
    return rel


def _validate_db(db_path: str):
    conn = sqlite3.connect(db_path)
    try:
        if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Database trong file sao lưu bị hỏng.")
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    except sqlite3.DatabaseError:
        raise ValueError("Database trong file sao lưu bị hỏng.")
    finally:
        conn.close()
    if not REQUIRED_TABLES <= tables:
        raise ValueError("File sao lưu không phải dữ liệu Gia Phả.")


def restore_backup(zip_path: str) -> dict:
    """Thay TOÀN BỘ dữ liệu hiện tại bằng dữ liệu trong zip_path.
    Trước khi thay, tự sao lưu dữ liệu hiện tại vào thư mục backups/.
    Trả về {"members": ..., "safety_backup": đường dẫn bản sao lưu tự động}."""
    try:
        zf = zipfile.ZipFile(zip_path)
    except (zipfile.BadZipFile, OSError):
        raise ValueError("File không phải file sao lưu Gia Phả (.zip).")

    with zf, tempfile.TemporaryDirectory() as tmp:
        try:
            manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
        except (KeyError, ValueError):
            raise ValueError("File không phải file sao lưu Gia Phả.")
        if manifest.get("app") != APP_ID:
            raise ValueError("File không phải file sao lưu Gia Phả.")
        if manifest.get("format", 0) > FORMAT_VERSION:
            raise ValueError("File sao lưu được tạo từ phiên bản mới hơn. Vui lòng cập nhật phần mềm.")

        # 1. Giải nén & kiểm tra ở thư mục tạm trước, chưa đụng vào dữ liệu thật
        new_db = os.path.join(tmp, "giapha.db")
        try:
            with zf.open("giapha.db") as src, open(new_db, "wb") as dst:
                shutil.copyfileobj(src, dst)
        except KeyError:
            raise ValueError("File sao lưu thiếu database.")
        _validate_db(new_db)

        new_uploads = os.path.join(tmp, "uploads")
        os.makedirs(new_uploads)
        for info in zf.infolist():
            rel = _safe_upload_member(info.filename)
            if not rel:
                continue
            target = os.path.join(new_uploads, rel)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)

        # 2. Sao lưu dữ liệu hiện tại (phòng khi khôi phục nhầm file)
        os.makedirs(AUTO_BACKUP_DIR, exist_ok=True)
        safety = os.path.join(AUTO_BACKUP_DIR, "TruocKhiKhoiPhuc-" + default_filename().split("-", 2)[2])
        if os.path.exists(database.DB_PATH):
            create_backup(safety)
        else:
            safety = None

        # 3. Thay database + thư mục ảnh
        os.makedirs(database.DATA_DIR, exist_ok=True)
        shutil.copyfile(new_db, database.DB_PATH)
        if os.path.isdir(database.UPLOAD_DIR):
            shutil.rmtree(database.UPLOAD_DIR)
        shutil.copytree(new_uploads, database.UPLOAD_DIR)
        for sub in ("persons", "family"):
            os.makedirs(os.path.join(database.UPLOAD_DIR, sub), exist_ok=True)

    # Bản sao lưu từ phiên bản cũ có thể thiếu bảng mới -> tạo bổ sung
    database.init_db()
    return {"members": _count_members(database.DB_PATH), "safety_backup": safety}
