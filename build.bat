@echo off
chcp 65001 >nul
rem ============================================================
rem build.bat - Tạo FILE CÀI ĐẶT phần mềm Gia Phả
rem   1. Làm rối JS, minify HTML/CSS rồi nhúng giao diện + schema.sql vào code (installer\pack_frontend.py)
rem   2. Biên dịch app sang mã máy bằng Nuitka (chống dịch ngược) -> build\main.dist\
rem   3. Đóng gói thành Setup.exe bằng Inno Setup             -> dist\GiaPha-Setup-x.y.z.exe
rem Cách dùng:  build.bat            (phiên bản mặc định 1.0.0)
rem             build.bat 1.0.1      (đổi phiên bản khi phát hành bản cập nhật)
rem ============================================================
setlocal
cd /d "%~dp0"

set "VERSION=%~1"
if "%VERSION%"=="" set "VERSION=1.0.0"
set "PY=.venv\Scripts\python.exe"
set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"

if not exist "%PY%" ( echo [LOI] Chua co .venv - xem README muc 3. & exit /b 1 )
if not exist "%ISCC%" ( echo [LOI] Chua cai Inno Setup 6 - winget install JRSoftware.InnoSetup & exit /b 1 )
if not exist "node_modules\.bin\javascript-obfuscator.cmd" ( echo [LOI] Chua cai cong cu frontend - chay: npm install & exit /b 1 )

echo === [1/3] Lam roi + nhung giao dien vao exe ===
"%PY%" installer\pack_frontend.py
if errorlevel 1 ( echo [LOI] Dong goi giao dien that bai. & exit /b 1 )
rem Xoa ban build cu (co the con thu muc frontend\ dang file ro tu ban truoc)
if exist build\main.dist rmdir /s /q build\main.dist
rem Cho Nuitka thay module frontend_bundle vua sinh trong build\gen
set "PYTHONPATH=%~dp0build\gen"

echo === [2/3] Bien dich app bang Nuitka (lan dau mat 10-30 phut) ===
"%PY%" -m nuitka main.py ^
    --standalone --assume-yes-for-downloads --remove-output ^
    --output-dir=build --output-filename=GiaPha.exe ^
    --windows-console-mode=disable ^
    --windows-icon-from-ico=icon/main-icon.ico ^
    --include-module=frontend_bundle ^
    --include-data-files=icon/main-icon.ico=icon/main-icon.ico ^
    --include-data-files=icon/main-icon.png=icon/main-icon.png ^
    --include-package=uvicorn --include-package=anyio ^
    --include-package-data=clr_loader --include-package-data=pythonnet ^
    --company-name="Raito Nguyen" --product-name="Gia Pha" ^
    --file-description="Gia Pha - Quan ly dong ho" ^
    --file-version=%VERSION% --product-version=%VERSION% ^
    --copyright="(c) 2026 Raito Nguyen"
if errorlevel 1 ( echo [LOI] Nuitka build that bai. & exit /b 1 )

echo === [3/3] Tao file cai dat bang Inno Setup ===
"%ISCC%" /Q /DAppVersion=%VERSION% installer\GiaPha.iss
if errorlevel 1 ( echo [LOI] Inno Setup that bai. & exit /b 1 )

echo.
echo XONG: dist\GiaPha-Setup-%VERSION%.exe
endlocal
