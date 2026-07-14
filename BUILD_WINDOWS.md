# KeePass Studio 8.4 Windows 构建说明

## 1. 放置图标

确认以下文件存在：

```text
D:\自开发源码\keepass-electron\build\icon.ico
D:\自开发源码\keepass-electron\build\icon.png
```

## 2. 一次生成便携版和安装版

```powershell
Set-Location "D:\自开发源码\keepass-electron"
Set-ExecutionPolicy -Scope Process Bypass -Force
& ".\scripts\build_all.ps1"
```

生成：

```text
D:\自开发源码\keepass-electron\release\KeePassStudio-Portable-8.4.0-x64.exe
D:\自开发源码\keepass-electron\release\KeePassStudio-Setup-8.4.0-x64.exe
```

## 3. 只打包便携版

```powershell
Set-Location "D:\自开发源码\keepass-electron"
Set-ExecutionPolicy -Scope Process Bypass -Force
& ".\scripts\build_portable.ps1"
```

## 4. 只打包安装版

```powershell
Set-Location "D:\自开发源码\keepass-electron"
Set-ExecutionPolicy -Scope Process Bypass -Force
& ".\scripts\build_installer.ps1"
```

## 5. 清理后重建

```powershell
Set-Location "D:\自开发源码\keepass-electron"
Remove-Item -Recurse -Force ".\node_modules", ".\.npm-cache", ".\dist", ".\release", ".\backend-dist", ".\backend-build" -ErrorAction SilentlyContinue
Set-ExecutionPolicy -Scope Process Bypass -Force
& ".\scripts\build_all.ps1"
```

注意：`backend-dist\keepass_backend.exe` 只是后台组件，不是桌面软件。最终软件在 `release` 目录。
