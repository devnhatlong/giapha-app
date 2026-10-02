"""
license.py
----------
Kiểm tra bản quyền (license) theo máy.

Flow kích hoạt:
1. Khách hàng xem Code ngay trên màn hình kích hoạt của app (hoặc chạy get_code.exe)
   rồi gửi cho người bán.
2. Người bán dùng tool generate_license (D:/Project/DesktopApp/license_tool)
   ký License Key bằng PRIVATE KEY (chỉ nằm trên máy người bán).
3. Khách nhập License Key vào app -> app kiểm tra chữ ký bằng PUBLIC KEY & lưu vào data/license.dat.

License Key = base64url(GIAPHA|machine_id|YYYY-MM-DD) . base64url(chữ ký Ed25519)

App KHÔNG chứa bí mật nào: PUBLIC KEY chỉ kiểm tra được key, không tạo được key.
PUBLIC_KEY_HEX lấy từ `python keygen.py --show` trong license_tool.
Cách tính Machine ID phải giống hàm get_machine_id() trong license_tool.
"""

import base64
import hashlib
import os
import uuid
from datetime import date, datetime
from typing import Optional

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from . import database

PRODUCT = "GIAPHA"
PUBLIC_KEY_HEX = "e81ceff45266f3941c0205463f203c467faa84ec05b5b76ef3ce6c2858179d61"
LICENSE_FILE = os.path.join(database.DATA_DIR, "license.dat")
# Tool generate_license cấp key "Vĩnh viễn" với hạn 2099-12-31
PERMANENT_FROM = date(2099, 1, 1)


def get_machine_id() -> str:
    """Machine ID 32 ký tự tạo từ địa chỉ MAC của máy (giống tool get_code.exe)."""
    try:
        raw = str(uuid.getnode())
        return hashlib.sha256(raw.encode()).hexdigest()[:32].upper()
    except Exception:
        return hashlib.sha256("fallback_machine".encode()).hexdigest()[:32].upper()


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _decode(license_key: str):
    """Kiểm tra chữ ký rồi tách thành (product, machine_id, expiry_str).
    Trả về None nếu sai định dạng, False nếu chữ ký không hợp lệ."""
    try:
        payload_b64, sig_b64 = license_key.strip().split(".")
        payload, sig = _b64d(payload_b64), _b64d(sig_b64)
    except Exception:
        return None
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(PUBLIC_KEY_HEX)).verify(sig, payload)
    except (InvalidSignature, ValueError):
        return False
    parts = payload.decode(errors="replace").split("|")
    return parts if len(parts) == 3 else None


def verify_license_key(license_key: str):
    """Trả về (hợp_lệ, thông_báo, ngày_hết_hạn hoặc None)."""
    # Bỏ khoảng trắng / xuống dòng lẫn vào khi khách copy key qua Zalo, email...
    license_key = "".join((license_key or "").split())
    if license_key and "." not in license_key:
        # Key kiểu HMAC cũ (trước 02/10/2026) không có dấu "." -> không còn được chấp nhận
        return False, "License Key thuộc phiên bản cũ. Vui lòng liên hệ nhà cung cấp để nhận key mới.", None
    parts = _decode(license_key)
    if parts is None:
        return False, "License Key không đúng định dạng.", None
    if parts is False:
        return False, "License Key không hợp lệ.", None
    product, machine_id, expiry_str = parts

    if product != PRODUCT:
        return False, "License Key không dành cho phần mềm Gia Phả.", None
    if machine_id != get_machine_id():
        return False, "License Key không đúng với Code của bạn.", None
    try:
        expiry = datetime.strptime(expiry_str, "%Y-%m-%d").date()
    except ValueError:
        return False, "License Key không hợp lệ (ngày hết hạn sai).", None
    if date.today() > expiry:
        return False, f"License Key đã hết hạn ngày {expiry.strftime('%d/%m/%Y')}.", expiry_str
    return True, "Kích hoạt thành công.", expiry_str


def _read_saved_key() -> Optional[str]:
    try:
        with open(LICENSE_FILE, "r", encoding="utf-8") as f:
            return f.read().strip() or None
    except OSError:
        return None


def save_license(license_key: str):
    os.makedirs(database.DATA_DIR, exist_ok=True)
    with open(LICENSE_FILE, "w", encoding="utf-8") as f:
        f.write("".join(license_key.split()))


def _expiry_info(expiry_str: Optional[str]) -> dict:
    """permanent: key vĩnh viễn (tool cấp ngày 2099-12-31); days_left: số ngày còn dùng
    sau hôm nay (0 = hết hạn cuối ngày hôm nay, âm = đã hết hạn)."""
    if not expiry_str:
        return {"permanent": False, "days_left": None}
    expiry = datetime.strptime(expiry_str, "%Y-%m-%d").date()
    if expiry >= PERMANENT_FROM:
        return {"permanent": True, "days_left": None}
    return {"permanent": False, "days_left": (expiry - date.today()).days}


def get_status() -> dict:
    """Trạng thái bản quyền hiện tại của máy này (dùng cho API & middleware)."""
    machine_id = get_machine_id()
    key = _read_saved_key()
    if not key:
        return {"activated": False, "machine_id": machine_id, "expiry_date": None,
                "permanent": False, "days_left": None,
                "message": "Phần mềm chưa được kích hoạt."}
    ok, message, expiry = verify_license_key(key)
    return {"activated": ok, "machine_id": machine_id, "expiry_date": expiry,
            **_expiry_info(expiry),
            "message": message if not ok else "Đã kích hoạt."}


def is_activated() -> bool:
    return get_status()["activated"]
