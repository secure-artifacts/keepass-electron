# KeePass Studio 8.4（Electron + React + Python）

本版本修复了 Electron 与 Python 后端通信中的 Unicode 代理字符错误，并把软件左上角品牌图标、窗口图标、任务栏图标和安装包图标统一为：

```text
D:\自开发源码\keepass-electron\build\icon.png
D:\自开发源码\keepass-electron\build\icon.ico
```

## 8.4 重点修复

- 修复：`UnicodeEncodeError: 'utf-8' codec can't encode character '\udca8'`。
- Electron 发送数据前会清理孤立 UTF-16 代理字符。
- Python 收到请求后会再次递归清理字符串。
- Google Sheets 返回的数据也会统一修复为有效 Unicode。
- Python 后端强制使用 UTF-8 stdin/stdout。
- 合法中文、希腊文、俄文和 Emoji 不会被破坏。
- 左上角品牌区域直接使用 `build/icon.png`，不再显示代码绘制的蓝色锁图标。
- 侧边导航去掉 `01 / 02 / 03`，改为：
  - 链接图标：表格连接
  - 预览图标：数据预览
  - 导出图标：导出 KeePass

## 表格格式

| 列 | 表头 | 用途 |
|---|---|---|
| A | 名称 | 独立模式的文件名和数据库名称 |
| B | 标题 | KeePass 条目标题 |
| C | 用户名 | KeePass 用户名 |
| D | 密码 | KeePass 密码 |
| E | URL | KeePass URL |
| F | 标签 | 多标签可用逗号或分号分隔 |
| G | 备注 | KeePass 备注 |
| H | TOTP | Base32 密钥或 otpauth URI |
| I | 运行日志 | 软件生成后自动写入 |

服务账号需要目标表格的“编辑者”权限。软件读取 A:I，只写入 I 列运行日志。

## 环境

- Windows 10/11 x64
- Node.js 22 LTS 推荐；Node.js 20.19+ 也支持
- npm 10.x 推荐
- Python 3.11 x64

## 运行开发版

```powershell
Set-Location "D:\自开发源码\keepass-electron"
Set-ExecutionPolicy -Scope Process Bypass -Force
& ".\scripts\run_dev.ps1"
```

## 一次打包便携版与安装版

```powershell
Set-Location "D:\自开发源码\keepass-electron"
Set-ExecutionPolicy -Scope Process Bypass -Force
& ".\scripts\build_all.ps1"
```

输出：

```text
release\KeePassStudio-Portable-8.4.0-x64.exe
release\KeePassStudio-Setup-8.4.0-x64.exe
```

## 只打包便携版

```powershell
& ".\scripts\build_portable.ps1"
```

## 只打包安装版

```powershell
& ".\scripts\build_installer.ps1"
```

安装版由 electron-builder 的 NSIS target 生成，不需要安装 Inno Setup。

## 更换图标

覆盖：

```text
build\icon.ico
build\icon.png
```

其中：

- `icon.png`：软件左上角品牌图标和部分界面资源。
- `icon.ico`：EXE、安装程序、窗口、任务栏、桌面快捷方式和开始菜单图标。

替换后必须重新打包，旧 EXE 不会自动更新。

## 8.4 数据预览序号规则

- 第一列表头为“选择”。
- 第二列表头为“序号”。
- 序号从 1 开始，按照当前筛选和排序后的显示顺序连续编号。
- 第 2 页继续显示 11、12……，而不是显示 Google Sheets 的实际行号。
- Google Sheets 实际行号仍保留在程序内部，用于选择、日志回写和准确定位数据。
