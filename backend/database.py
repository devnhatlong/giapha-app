"""
database.py
-----------
Module này chịu trách nhiệm:
1. Tạo kết nối tới file database SQLite (chỉ là 1 file .db trên ổ cứng)
2. Khởi tạo các bảng nếu database chưa tồn tại (chạy schema.sql)

Vì sao dùng SQLite thay vì MySQL/XAMPP:
- SQLite không cần cài phần mềm server riêng, không cần "bật/tắt" gì cả.
- Toàn bộ dữ liệu nằm trong 1 file duy nhất (data/giapha.db).
- Muốn backup? Chỉ cần copy file đó ra USB hoặc Google Drive là xong.
"""

import sqlite3
import os

# Đường dẫn tới thư mục chứa file này (backend/)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Thư mục gốc của toàn bộ project (lùi lên 1 cấp từ backend/)
PROJECT_ROOT = os.path.dirname(BASE_DIR)

# Nơi lưu file database thật sự
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
DB_PATH = os.path.join(DATA_DIR, "giapha.db")
SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")


def get_connection() -> sqlite3.Connection:
    """
    Mở 1 kết nối tới file database.
    row_factory = sqlite3.Row giúp ta lấy dữ liệu ra dạng "dict-like"
    (ví dụ row["full_name"]) thay vì phải nhớ thứ tự cột (row[0], row[1]...).
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Bật kiểm tra khóa ngoại (foreign key), mặc định SQLite tắt tính năng này
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """
    Chạy khi ứng dụng khởi động lần đầu: đọc file schema.sql và tạo các bảng
    (CREATE TABLE IF NOT EXISTS -> chạy nhiều lần cũng không lỗi, không mất dữ liệu cũ).
    """
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    conn = get_connection()
    try:
        conn.executescript(schema_sql)
        conn.commit()
        print(f"[OK] Database đã sẵn sàng tại: {DB_PATH}")
    finally:
        conn.close()
