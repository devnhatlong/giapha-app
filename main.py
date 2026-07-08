"""
main.py
-------
ĐÂY LÀ FILE CHẠY ĐỂ MỞ ỨNG DỤNG.
Người dùng cuối chỉ cần chạy file này (hoặc file .exe được đóng gói từ nó)
-> Không cần biết "server" là gì, không cần mở terminal, không cần XAMPP.

NGUYÊN TẮC OFFLINE:
- Server chỉ lắng nghe 127.0.0.1 (không ra internet).
- Frontend/CSS/JS/font/icon/ảnh đều phục vụ từ thư mục local.
- Không dùng CDN, Google Fonts, hay API bên ngoài khi chạy app.

Cách hoạt động:
1. Khởi tạo database (tạo bảng nếu chưa có).
2. Chạy backend FastAPI ngầm trong 1 luồng (thread) riêng, ở địa chỉ nội bộ 127.0.0.1
   (chỉ máy này truy cập được, không mở ra internet).
3. Mở 1 cửa sổ ứng dụng desktop (pywebview) hiển thị giao diện web của bước 2.
   Khi người dùng đóng cửa sổ -> toàn bộ chương trình tự tắt.
"""

import base64
import threading
import time
import os
import sys

import uvicorn
import webview

from backend import database
from backend.api import app
from fastapi.staticfiles import StaticFiles

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
ICON_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon")
os.makedirs(ICON_DIR, exist_ok=True)

HOST = "127.0.0.1"
PORT = 8756  # Cổng nội bộ, ít khi trùng với phần mềm khác


def resolve_app_icon():
    """Tìm file icon trong thư mục icon/ (ưu tiên main-icon)."""
    for name in ("main-icon.ico", "main-icon.png", "app.ico", "app.png", "icon.ico", "icon.png"):
        path = os.path.join(ICON_DIR, name)
        if os.path.isfile(path):
            return path
    return None


def enable_windows_app_icon(icon_path):
    """
    pywebview 5.x trên Windows bỏ qua tham số icon= và luôn dùng icon python.exe.
    Gắn icon tùy chỉnh sau khi cửa sổ WinForms được tạo.
    """
    if sys.platform != "win32" or not icon_path:
        return

    icon_path = os.path.abspath(icon_path)
    webview._settings["icon"] = icon_path

    from webview.platforms import winforms as wf

    if getattr(wf.BrowserView.BrowserForm, "_gp_icon_patched", False):
        return

    original_init = wf.BrowserView.BrowserForm.__init__

    def patched_init(self, window, cache_dir):
        original_init(self, window, cache_dir)
        try:
            from System.Drawing import Bitmap, Icon

            if icon_path.lower().endswith((".png", ".jpg", ".jpeg", ".bmp", ".webp")):
                bitmap = Bitmap(icon_path)
                self.Icon = Icon.FromHandle(bitmap.GetHicon()).Clone()
            else:
                self.Icon = Icon(icon_path)
        except Exception:
            pass

    patched_init._gp_icon_patched = True
    wf.BrowserView.BrowserForm.__init__ = patched_init
    wf.BrowserView.BrowserForm._gp_icon_patched = True


def run_server():
    """Chạy FastAPI server trong nền, không hiện log rườm rà cho người dùng thường."""
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")


class JSBridge:
    """
    Cầu nối JS -> Python, gọi từ frontend qua window.pywebview.api.
    Dùng để mở hộp thoại "Lưu file" thật của hệ điều hành (thay vì trình duyệt
    tự tải xuống thư mục Downloads mặc định), ví dụ khi xuất ảnh cây gia phả.
    """

    def save_file(self, filename, data_b64, file_types=None):
        window = webview.windows[0]
        types = tuple(file_types) if file_types else ()
        result = window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=filename,
            file_types=types,
        )
        if not result:
            return {"ok": False, "canceled": True}
        path = result[0] if isinstance(result, (list, tuple)) else result
        try:
            with open(path, "wb") as f:
                f.write(base64.b64decode(data_b64))
            return {"ok": True, "path": path}
        except Exception as e:
            return {"ok": False, "error": str(e)}


def main():
    # Bước 1: chuẩn bị database
    database.init_db()

    # Gắn thư mục frontend (HTML/CSS/JS) và uploads (ảnh) để trình duyệt nội bộ đọc được
    # Lưu ý: phải mount SAU khi các route /api/... đã được định nghĩa trong backend/api.py
    app.mount("/app-icon", StaticFiles(directory=ICON_DIR), name="app-icon")
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
        js_api=JSBridge(),
    )
    app_icon = resolve_app_icon()
    enable_windows_app_icon(app_icon)
    if app_icon:
        webview.start(icon=app_icon)
    else:
        webview.start()


if __name__ == "__main__":
    main()
