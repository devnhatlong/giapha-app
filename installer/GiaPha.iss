; ============================================================
; Script tạo FILE CÀI ĐẶT (Setup.exe) cho phần mềm Gia Phả — Inno Setup 6
; Không chạy trực tiếp file này: dùng build.bat ở thư mục gốc
; (build.bat biên dịch app bằng Nuitka trước, rồi gọi ISCC với file này).
;
; Đầu vào : build\main.dist\   (app đã biên dịch)
; Đầu ra  : dist\GiaPha-Setup-<phiên bản>.exe
;
; Dữ liệu người dùng KHÔNG nằm trong thư mục cài đặt mà ở %LOCALAPPDATA%\GiaPha
; -> gỡ cài đặt / cài bản mới không làm mất dữ liệu gia phả & bản quyền.
; ============================================================

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppName "Gia Phả"
#define AppExe "GiaPha.exe"

[Setup]
; AppId cố định để Windows nhận ra các bản cài sau là bản CẬP NHẬT. Không đổi giá trị này.
AppId={{6C4523F4-1881-4B4B-A889-E4A88FBCB17C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Raito Nguyen
AppCopyright=© 2026 Raito Nguyen
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\GiaPha
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; Cho khách chọn: cài cho mọi người dùng (cần quyền admin) hoặc chỉ cho mình
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\dist
OutputBaseFilename=GiaPha-Setup-{#AppVersion}
SetupIconFile=..\icon\main-icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
; Đang mở app khi cài bản mới -> tự đề nghị đóng app
CloseApplications=yes

[Languages]
Name: "vietnamese"; MessagesFile: "Vietnamese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; Bản cài cũ để giao diện dạng file rõ (frontend\, backend\schema.sql) -> xóa khi cài đè.
; Từ bản này giao diện đã được làm rối + nhúng vào GiaPha.exe.
Type: filesandordirs; Name: "{app}\frontend"
Type: filesandordirs; Name: "{app}\backend"

[Files]
Source: "..\build\main.dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
