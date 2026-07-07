# Gia Phả — Phần mềm quản lý dòng họ (chạy offline, local)

Ứng dụng desktop viết bằng Python, dùng SQLite (không cần cài server như XAMPP),
giao diện web hiện đại hiển thị trong 1 cửa sổ ứng dụng (qua `pywebview`).

## 1. Cấu trúc dự án

```
giapha_app/
├── main.py                 <- Chạy file này để mở ứng dụng
├── requirements.txt        <- Danh sách thư viện cần cài
├── backend/
│   ├── database.py         <- Kết nối & khởi tạo SQLite
│   ├── schema.sql           <- Cấu trúc các bảng dữ liệu
│   └── api.py               <- API xử lý logic (thêm/sửa/xóa/tìm kiếm)
├── frontend/
│   ├── index.html           <- Giao diện
│   ├── css/style.css
│   └── js/app.js             <- Logic giao diện, vẽ cây gia phả bằng SVG
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

## 3. Đóng gói thành 1 file .exe để người dùng khác không cần cài Python

Đây là bước biến ứng dụng thành 1 file chạy trực tiếp, giống phần mềm bình thường:

```bash
pip install pyinstaller
pyinstaller --noconfirm --windowed --name "GiaPha" ^
    --add-data "frontend;frontend" ^
    --add-data "backend/schema.sql;backend" ^
    main.py
```
*(Trên macOS/Linux, thay `;` bằng `:` trong `--add-data`)*

File .exe kết quả nằm trong thư mục `dist/GiaPha/`. Người dùng chỉ cần
copy cả thư mục đó và double-click `GiaPha.exe` — không cần cài Python,
không cần cài gì thêm.

> Lưu ý: khi đóng gói .exe, đường dẫn database (`data/giapha.db`) nên được
> đặt cạnh file .exe để dữ liệu không bị mất khi cập nhật phần mềm. Đây là điều
> ta sẽ tinh chỉnh ở bước đóng gói cuối cùng, sau khi phần mềm đã hoàn thiện.

## 4. Chức năng đã có trong bản đầu tiên (MVP)

- Thêm / sửa / xóa thành viên với đầy đủ thông tin cá nhân
- Thiết lập quan hệ: cha/mẹ - con, vợ/chồng (kể cả tái hôn)
- Tự động tính "đời" (thế hệ) dựa trên quan hệ cha/mẹ - con
- Sơ đồ cây gia phả trực quan (SVG, kéo xem, chọn xem theo nhánh)
- Quản lý ngày giỗ / sự kiện quan trọng
- Trang tổng quan thống kê nhanh
- Tìm kiếm thành viên theo tên

## 5. Các chức năng dự kiến làm ở bước sau

- Upload ảnh đại diện / tài liệu đính kèm (đã có bảng DB, chưa có giao diện)
- Xuất/nhập file GEDCOM (chuẩn gia phả quốc tế)
- Xuất cây gia phả ra PDF / ảnh để in
- Sao lưu (backup) & khôi phục dữ liệu bằng 1 nút bấm
- Nhắc lịch ngày giỗ khi mở ứng dụng
