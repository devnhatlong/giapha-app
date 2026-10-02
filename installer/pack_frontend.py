"""
pack_frontend.py
----------------
Bước build (build.bat gọi trước Nuitka): làm rối + nhúng giao diện vào trong GiaPha.exe,
để thư mục cài đặt KHÔNG còn file HTML/CSS/JS đọc được.

1. Copy frontend/ ra build/frontend_min/ rồi:
   - JS  : obfuscate (javascript-obfuscator) — đổi tên biến cục bộ, mã hóa chuỗi, xóa comment.
           GIỮ tên hàm toàn cục (showTab, openDetail...) vì HTML gọi qua onclick.
   - HTML: minify (html-minifier-terser) — xóa comment, khoảng trắng.
   - CSS : minify (clean-css).
2. Sinh build/gen/frontend_bundle.py chứa toàn bộ file trên (nén zlib) + schema.sql.
   Nuitka biên dịch module này vào exe; main.py / database.py tự dùng nếu có.

Mã nguồn trong frontend/ không bị thay đổi. Cần Node.js + `npm install` (package.json).
"""

import os
import shutil
import subprocess
import sys
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "frontend")
OUT = os.path.join(ROOT, "build", "frontend_min")
GEN_DIR = os.path.join(ROOT, "build", "gen")
BIN = os.path.join(ROOT, "node_modules", ".bin")

# Mức vừa phải: đủ khó đọc nhưng không làm app chậm (không bật controlFlowFlattening / selfDefending)
OBFUSCATOR_ARGS = [
    "--compact", "true",
    "--rename-globals", "false",
    "--identifier-names-generator", "hexadecimal",
    "--string-array", "true",
    "--string-array-encoding", "base64",
    "--string-array-threshold", "0.75",
    "--split-strings", "false",
    "--unicode-escape-sequence", "false",
    "--self-defending", "false",
    "--control-flow-flattening", "false",
    "--dead-code-injection", "false",
]
HTML_ARGS = [
    "--collapse-whitespace", "--conservative-collapse",
    "--remove-comments", "--minify-css", "true", "--minify-js", "true",
]


def tool(name):
    path = os.path.join(BIN, name + (".cmd" if os.name == "nt" else ""))
    if not os.path.exists(path):
        sys.exit(f"[LOI] Thiếu công cụ {name}. Chạy `npm install` ở thư mục gốc project.")
    return path


def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                            shell=os.name == "nt")
    if result.returncode != 0:
        sys.exit(f"[LOI] {' '.join(cmd[:1])} thất bại:\n{result.stdout}\n{result.stderr}")


def process_frontend():
    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(SRC, OUT)
    for dirpath, _dirs, names in os.walk(OUT):
        for name in names:
            path = os.path.join(dirpath, name)
            ext = os.path.splitext(name)[1].lower()
            if ext == ".js":
                # Mỗi file 1 tiền tố riêng: các file chạy chung 1 trang, biến toàn cục obfuscator
                # tự thêm (mảng chuỗi...) mà trùng tên giữa các file sẽ gây lỗi khai báo lại.
                prefix = "gp_" + "".join(c if c.isalnum() else "_" for c in os.path.splitext(name)[0]) + "_"
                run([tool("javascript-obfuscator"), path, "--output", path,
                     "--identifiers-prefix", prefix, *OBFUSCATOR_ARGS])
            elif ext == ".html":
                run([tool("html-minifier-terser"), *HTML_ARGS, "-o", path, path])
            elif ext == ".css":
                run([tool("cleancss"), "-o", path, path])


def write_bundle():
    files = {}
    for dirpath, _dirs, names in os.walk(OUT):
        for name in names:
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, OUT).replace(os.sep, "/")
            with open(path, "rb") as f:
                files[rel] = zlib.compress(f.read(), 9)
    with open(os.path.join(ROOT, "backend", "schema.sql"), "rb") as f:
        schema = zlib.compress(f.read(), 9)

    os.makedirs(GEN_DIR, exist_ok=True)
    with open(os.path.join(GEN_DIR, "frontend_bundle.py"), "w", encoding="utf-8") as f:
        f.write("# File SINH TỰ ĐỘNG bởi installer/pack_frontend.py — không sửa tay.\n")
        f.write("# Dữ liệu nén zlib; main.py / database.py giải nén khi chạy.\n")
        f.write(f"FILES = {files!r}\n")
        f.write(f"SCHEMA_SQL = {schema!r}\n")
    total = sum(len(v) for v in files.values())
    print(f"Đã nhúng {len(files)} file giao diện ({total // 1024} KB nén) + schema.sql")


if __name__ == "__main__":
    process_frontend()
    write_bundle()
