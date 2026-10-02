# Gia Phả — Phần mềm quản lý dòng họ (chạy offline, local)

Ứng dụng desktop viết bằng Python, dùng SQLite (không cần cài server như XAMPP),
giao diện web hiện đại hiển thị trong 1 cửa sổ ứng dụng (qua `pywebview`).

## 1. Cấu trúc dự án

```
giapha_app/
├── main.py                 <- Chạy file này để mở ứng dụng
├── requirements.txt        <- Danh sách thư viện cần cài
├── requirements-build.txt  <- Thư viện chỉ cần khi build bản cài đặt (Nuitka...)
├── build.bat               <- Tạo file cài đặt Setup.exe (xem mục 3)
├── installer/              <- Script Inno Setup + file ngôn ngữ tiếng Việt
├── backend/
│   ├── database.py         <- Kết nối & khởi tạo SQLite
│   ├── schema.sql           <- Cấu trúc các bảng dữ liệu
│   ├── license.py           <- Kiểm tra bản quyền (mục 6)
│   └── api.py               <- API xử lý logic (thêm/sửa/xóa/tìm kiếm)
├── frontend/
│   ├── index.html           <- Giao diện
│   ├── css/style.css
│   └── js/app.js             <- Logic giao diện, vẽ cây gia phả bằng SVG
├── icon/                    <- Icon app (main-icon.png / .ico)
├── data/
│   └── giapha.db            <- File database (tự tạo khi chạy lần đầu)
└── uploads/                 <- Nơi lưu ảnh đại diện / tài liệu đính kèm
```

## 2. Chạy thử (lần đầu cần có Python + internet để tải thư viện 1 lần)

```bash
# Bước 1: Cài Python 3.10+ nếu máy chưa có (https://python.org)

# Bước 2: Mở terminal/cmd tại thư mục giapha_app, cài thư viện
pip install -r requirements.txt

# Bước 3: Chạy ứng dụng
python main.py
```

Cửa sổ ứng dụng sẽ tự mở lên. Sau bước cài thư viện, những lần sau
chỉ cần chạy `python main.py` — không cần internet, không cần bật server thủ công.

## Nguyên tắc chạy offline

Ứng dụng **phải chạy được khi không có internet**. Cụ thể:

| Thành phần | Cách làm hiện tại |
|------------|-------------------|
| **Font** | Font hệ thống (`Segoe UI`, Arial…) — không Google Fonts |
| **CSS / JS** | File local trong `frontend/` — không CDN |
| **API** | FastAPI trên `127.0.0.1:8756` — không gọi server ngoài |
| **Database** | SQLite file `data/giapha.db` |
| **Ảnh / icon** | `uploads/`, `icon/` — lưu trên máy |
| **Cây gia phả** | Vẽ SVG thuần — không thư viện JS ngoài |

> Internet chỉ cần **một lần** khi dev cài thư viện Python (`pip install -r requirements.txt`).
> Người dùng cuối (hoặc bản .exe) không cần mạng.

Khi thêm tính năng mới: **không** dùng CDN, Google Fonts, API cloud, hay font tải từ URL.
Nếu cần font/ảnh riêng → nhúng file vào project.

## 3. Tạo file cài đặt (Setup.exe) cho khách hàng

Chỉ cần chạy **một lệnh** (trên máy dev, Windows):

```bat
build.bat 1.0.0
```

Kết quả: `dist\GiaPha-Setup-1.0.0.exe`. Gửi **duy nhất file này** cho khách.
Khách bấm đúp → cài theo từng bước (Tiếp theo → chọn thư mục → tạo icon Desktop → Cài đặt) → mở app → kích hoạt.

`build.bat` làm 2 việc:
1. **Nuitka** biên dịch Python sang mã máy (C) → `build\main.dist\GiaPha.exe`. Không còn file `.py`/`.pyc`
   nên khó dịch ngược hơn nhiều so với PyInstaller. Lần đầu mất 10–30 phút (tự tải trình biên dịch MinGW).
2. **Inno Setup** (`installer\GiaPha.iss`) gói thư mục đó thành file cài đặt tiếng Việt.

Chuẩn bị máy build (một lần):

```bat
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt -r requirements-build.txt
winget install JRSoftware.InnoSetup
```

Phát hành bản cập nhật: tăng số phiên bản (`build.bat 1.0.1`), gửi Setup mới cho khách cài đè.
**Không đổi `AppId`** trong `installer\GiaPha.iss`, để Windows nhận đúng đây là bản cập nhật.

### Dữ liệu người dùng nằm ở đâu?

| Chạy bằng | Database, ảnh, license |
|-----------|------------------------|
| `python main.py` (dev) | `data/`, `uploads/` trong thư mục project |
| Bản cài đặt | `%LOCALAPPDATA%\GiaPha\data`, `%LOCALAPPDATA%\GiaPha\uploads` |

Thư mục cài đặt (Program Files) chỉ đọc. Dữ liệu để riêng nên **gỡ cài đặt hoặc cài bản mới không mất dữ liệu**.
Người dùng chuyển máy bằng nút **Sao lưu dữ liệu** trong app (xem mục 4). Hoặc copy thủ công thư mục `%LOCALAPPDATA%\GiaPha`.

**Yêu cầu máy khách:** Windows 10/11 64-bit, có Microsoft Edge WebView2 Runtime (Windows 11 có sẵn,
Windows 10 đa số đã có qua Windows Update).

## 4. Chức năng đã có trong bản đầu tiên (MVP)

- Thêm / sửa / xóa thành viên với đầy đủ thông tin cá nhân
- Thiết lập quan hệ: cha/mẹ - con, vợ/chồng (kể cả tái hôn)
- Tự động tính "đời" (thế hệ) dựa trên quan hệ cha/mẹ - con
- Sơ đồ cây gia phả trực quan (SVG, kéo xem, chọn xem theo nhánh)
- Quản lý ngày giỗ / sự kiện quan trọng
- Trang tổng quan thống kê nhanh
- Tìm kiếm thành viên theo tên
- Sao lưu & khôi phục toàn bộ dữ liệu (database + ảnh) ra 1 file `.zip` để chuyển sang máy khác
  (mục **Sao lưu dữ liệu**; xử lý ở `backend/backup.py`, không gồm `license.dat` vì bản quyền gắn với từng máy.
  Trước mỗi lần khôi phục, dữ liệu cũ được tự sao lưu vào thư mục `backups/`)

## 5. Các chức năng dự kiến làm ở bước sau

- Upload ảnh đại diện gia phả / từng thành viên
- Xuất/nhập file GEDCOM (chuẩn gia phả quốc tế)
- Xuất cây gia phả ra PDF / ảnh để in
- Nhắc lịch ngày giỗ khi mở ứng dụng

## 6. Bản quyền (License) theo máy

App bắt buộc kích hoạt khi mở lần đầu. Khi chưa kích hoạt, backend chặn toàn bộ API dữ liệu (trả về 403).

1. Khách hàng chạy `get_code.exe` (hoặc xem ngay ở màn hình kích hoạt) để lấy **Code** rồi gửi cho bạn.
2. Bạn mở `generate_license.exe` trên máy mình, nhập Code + ngày hết hạn → được **License Key**.
3. Khách dán License Key vào màn hình kích hoạt. Key được lưu ở `data/license.dat`.
4. Gia hạn / nâng cấp: mục **Bản quyền** trong app hiện hạn dùng, số ngày còn lại, Code; khách dán key mới vào đó.
   Còn ≤ 7 ngày thì chân sidebar báo "sắp hết hạn". Key mới có hạn ngắn hơn key đang dùng sẽ bị hỏi xác nhận trước khi thay.

- Tool tạo key nằm ở `D:\Project\DesktopApp\license_tool` (không đóng gói chung với app, không gửi `generate_license` cho khách).
- Key ký bằng **Ed25519**: private key chỉ nằm trên máy admin (`license_tool/keys/private_key.pem`), app chỉ chứa **public key** (`PUBLIC_KEY_HEX` trong `backend/license.py`) nên không ai trích được bí mật từ app để tự tạo key.
- Key gắn với mã sản phẩm `GIAPHA` → key của sản phẩm khác không mở được app này.
- Code (mã máy) tính từ địa chỉ MAC → đổi card mạng có thể làm đổi Code, khi đó cần cấp key mới.
