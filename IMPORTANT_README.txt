KeePass Studio Electron 8.4

1. backend-dist\keepass_backend.exe 只是后台组件，不能作为桌面软件单独打开。
2. 左上角品牌图标使用 build\icon.png。
3. EXE、任务栏、安装包和快捷方式图标使用 build\icon.ico。
4. 一次生成便携版和安装版：
   PowerShell 执行 .\scripts\build_all.ps1
5. 最终文件：
   release\KeePassStudio-Portable-8.4.0-x64.exe
   release\KeePassStudio-Setup-8.4.0-x64.exe
6. 本版已修复 UnicodeEncodeError / 孤立 UTF-16 代理字符错误。
