"""
main.py
-------
ĐÂY LÀ FILE CHẠY ĐỂ MỞ ỨNG DỤNG.
Người dùng cuối chỉ cần chạy file này (hoặc file .exe được đóng gói từ nó)
-> Không cần biết "server" là gì, không cần mở terminal, không cần XAMPP.

Cách hoạt động:
1. Khởi tạo database (tạo bảng nếu chưa có).
2. Chạy backend FastAPI ngầm trong 1 luồng (thread) riêng, ở địa chỉ nội bộ 127.0.0.1
   (chỉ máy này truy cập được, không mở ra internet).
3. Mở 1 cửa sổ ứng dụng desktop (pywebview) hiển thị giao diện web của bước 2.
   Khi người dùng đóng cửa sổ -> toàn bộ chương trình tự tắt.
"""

import threading
import time
import os

import uvicorn
import webview

from backend import database
from backend.api import app
from fastapi.staticfiles import StaticFiles

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")

HOST = "127.0.0.1"
PORT = 8756  # Cổng nội bộ, ít khi trùng với phần mềm khác


def run_server():
    """Chạy FastAPI server trong nền, không hiện log rườm rà cho người dùng thường."""
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")


def main():
    # Bước 1: chuẩn bị database
    database.init_db()

    # Gắn thư mục frontend (HTML/CSS/JS) và uploads (ảnh) để trình duyệt nội bộ đọc được
    # Lưu ý: phải mount SAU khi các route /api/... đã được định nghĩa trong backend/api.py
    app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

    # Bước 2: chạy server ngầm (daemon=True -> tự tắt khi app chính đóng)
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Đợi server khởi động xong trước khi mở cửa sổ (tránh mở lên bị trắng trang)
    time.sleep(1)

    # Bước 3: mở cửa sổ ứng dụng desktop trỏ vào giao diện web
    webview.create_window(
        "Gia Phả - Quản lý dòng họ",
        f"http://{HOST}:{PORT}/",
        width=1280,
        height=800,
        min_size=(1000, 700),
    )
    webview.start()


if __name__ == "__main__":
    main()
