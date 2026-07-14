# KeePass Studio

**Google Sheets → KeePass 桌面工具** — 将 Google 表格中的账号数据一键转换为 KeePass `.kdbx` 数据库文件。

[![Build and Release](https://github.com/secure-artifacts/keepass-electron/actions/workflows/release.yml/badge.svg)](https://github.com/secure-artifacts/keepass-electron/actions/workflows/release.yml)
[![CodeQL](https://github.com/secure-artifacts/keepass-electron/actions/workflows/codeql.yml/badge.svg)](https://github.com/secure-artifacts/keepass-electron/actions/workflows/codeql.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-8.4.0-green.svg)](https://github.com/secure-artifacts/keepass-electron/releases/latest)

---

## 目录

- [功能简介](#功能简介)
- [技术栈](#技术栈)
- [系统要求](#系统要求)
- [快速开始](#快速开始)
- [Google 表格格式](#google-表格格式)
- [使用说明](#使用说明)
- [开发指南](#开发指南)
- [构建与打包](#构建与打包)
- [项目结构](#项目结构)
- [常见问题](#常见问题)

---

## 功能简介

KeePass Studio 是一款 Windows 桌面应用，可以将 Google Sheets 中按约定格式存储的账号信息（用户名、密码、URL、TOTP 等）批量导出为标准 KeePass `.kdbx` 数据库文件。

### 核心功能

| 功能 | 说明 |
|------|------|
| 📊 **Google Sheets 读取** | 通过服务账号 JSON 安全读取指定表格 |
| 🔍 **数据预览** | 分页展示、多列排序、关键字筛选 |
| ✅ **批量选择** | 勾选任意行，只导出选中的条目 |
| 🔑 **TOTP 支持** | 支持 Base32 密钥或完整 `otpauth://` URI |
| 📁 **KeePass 导出** | 生成标准 KDBX 文件，可直接在 KeePass 中打开 |
| 🏷️ **多标签分组** | 支持逗号 / 分号分隔的多标签 |
| 📝 **运行日志回写** | 每次导出后自动将结果写入表格 I 列 |
| 🎨 **四套主题** | 浅色 / 深色 / 海洋 / 森林，本地持久化 |

---

## 技术栈

```
前端    React 19 + Vite 7（Renderer 进程）
桌面    Electron 37（Main + Preload，contextIsolation 隔离）
后端    Python 3.11（常驻子进程，JSON Lines 协议通信）
打包    electron-builder 26（便携版 + NSIS 安装版）
```

- **安全设计**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，Renderer 只能调用白名单 IPC 接口。
- **后端架构**：Python 后端由 PyInstaller 打包为 `keepass_backend.exe`，随 Electron 包一并分发，无需用户安装 Python。

---

## 系统要求

### 使用安装包 / 便携版（普通用户）

| 要求 | 说明 |
|------|------|
| **操作系统** | Windows 10 / 11 x64 |
| **其他依赖** | 无需安装 Node.js 或 Python |

> 直接从 [Releases](https://github.com/secure-artifacts/keepass-electron/releases/latest) 下载 `KeePassStudio-Setup-*.exe`（安装版）或 `KeePassStudio-Portable-*.exe`（便携版）即可。

### 本地开发 / 自行构建

| 依赖 | 版本要求 |
|------|---------|
| **Node.js** | 20.19 LTS 或更高（推荐 22 LTS） |
| **npm** | 10.x |
| **Python** | 3.11 x64 |
| **PyInstaller** | 6.x（`pip install pyinstaller`） |

---

## 快速开始

### 1. 下载并安装

前往 [Releases 页面](https://github.com/secure-artifacts/keepass-electron/releases/latest)，下载对应文件：

- **`KeePassStudio-Setup-8.4.0-x64.exe`** — 安装版，包含桌面快捷方式
- **`KeePassStudio-Portable-8.4.0-x64.exe`** — 便携版，无需安装，双击即用

### 2. 准备 Google 服务账号

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建项目
2. 启用 **Google Sheets API**
3. 创建**服务账号**，下载 JSON 密钥文件
4. 将服务账号邮箱添加为 Google 表格的**编辑者**（服务账号需要"编辑者"权限以写入 I 列运行日志）

### 3. 准备 Google 表格

按照以下列格式创建表格（详见[表格格式说明](#google-表格格式)）：

```
A 名称 | B 标题 | C 用户名 | D 密码 | E URL | F 标签 | G 备注 | H TOTP | I 运行日志
```

### 4. 连接并导出

1. 打开 KeePass Studio
2. 在**表格连接**页面填写：
   - Google 表格链接
   - 工作表名称（默认 `Sheet1`）
   - 服务账号 JSON 文件路径
   - KeePass 输出目录和数据库名称
3. 点击**连接**，进入**数据预览**页确认数据
4. 勾选要导出的条目，点击**导出 KeePass**

---

## Google 表格格式

软件读取表格的 **A~I 列**，第一行为表头（会自动跳过）：

| 列 | 表头 | 是否必填 | 说明 |
|----|------|---------|------|
| **A** | 名称 | ✅ 必填 | 独立模式下的文件名前缀，也用作 KeePass 条目标识 |
| **B** | 标题 | ✅ 必填 | KeePass 条目标题（Entry Title） |
| **C** | 用户名 | 可选 | KeePass 用户名字段 |
| **D** | 密码 | 可选 | KeePass 密码字段 |
| **E** | URL | 可选 | KeePass URL 字段 |
| **F** | 标签 | 可选 | 多标签用逗号 `,` 或分号 `;` 分隔 |
| **G** | 备注 | 可选 | KeePass 备注字段（支持多行） |
| **H** | TOTP | 可选 | Base32 密钥（如 `JBSWY3DPEHPK3PXP`）或完整 `otpauth://totp/...` URI |
| **I** | 运行日志 | 自动写入 | 每次导出后由软件自动写入时间戳和结果，无需手动填写 |

> **提示**：服务账号需要目标表格的"编辑者"权限，软件只写入 I 列运行日志，不修改 A~H 列数据。

---

## 使用说明

### 界面导航

软件左侧为三个功能页：

```
🔗 表格连接  →  配置 Google Sheets 连接参数
📋 数据预览  →  查看、筛选、选择要导出的条目
📤 导出 KeePass  →  生成 .kdbx 文件
```

### 表格连接页

| 字段 | 说明 |
|------|------|
| Google 表格链接 | 表格的完整 URL，例如 `https://docs.google.com/spreadsheets/d/xxx` |
| 工作表名称 | 数据所在的 Sheet 名称，默认 `Sheet1` |
| 服务账号 JSON | 点击浏览选择下载的服务账号密钥文件 |
| 输出目录 | KeePass 数据库文件保存位置 |
| 数据库名称 | 生成的 `.kdbx` 文件名（无需加后缀） |
| 组名称 | KeePass 内部分组名，默认 `Google Sheets Import` |
| 记住配置 | 勾选后下次打开自动填入上次配置 |

### 数据预览页

- **分页显示**：每页显示 10 条，支持翻页
- **列排序**：点击任意列表头升序 / 降序排列
- **全选 / 反选**：表头复选框一键操作
- **序号规则**：序号从 1 连续编号，跨页继续（不显示 Google Sheets 原始行号）

### 导出 KeePass 页

- 确认选中条目数量后点击**开始导出**
- 进度条实时显示当前处理进度
- 导出完成后运行日志自动写回 Google Sheets I 列
- 生成的 `.kdbx` 文件可直接用 KeePass 2.x 或 KeePassXC 打开（无主密码）

### 主题切换

点击右上角主题切换按钮，可在以下主题间切换：

- ☀️ **浅色** — 标准白色界面
- 🌙 **深色** — 深色护眼模式
- 🌊 **海洋** — 蓝色渐变主题
- 🌲 **森林** — 绿色自然主题

---

## 开发指南

### 克隆并安装依赖

```powershell
git clone https://github.com/secure-artifacts/keepass-electron.git
cd keepass-electron
npm install
```

### 构建 Python 后端

```powershell
cd backend
pip install -r requirements.txt
pyinstaller keepass_backend.spec
cd ..
# 构建产物：backend-dist\keepass_backend.exe
```

### 启动开发模式

```powershell
# 同时启动 Vite dev server 和 Electron
npm run dev
```

> 开发模式下 Renderer 热更新，修改 `src/` 下的文件无需重启。

---

## 构建与打包

### 一次构建便携版 + 安装版

```powershell
npm run dist:all
```

输出至 `release\` 目录：

```
release\KeePassStudio-Portable-8.4.0-x64.exe   # 便携版（单文件）
release\KeePassStudio-Setup-8.4.0-x64.exe      # NSIS 安装版
```

### 单独构建

```powershell
npm run dist:portable    # 仅便携版
npm run dist:installer   # 仅安装版
```

### 替换图标

覆盖以下两个文件后重新打包：

| 文件 | 用途 |
|------|------|
| `build\icon.png` | 软件左上角品牌图标、部分界面资源 |
| `build\icon.ico` | EXE 图标、安装程序、窗口、任务栏、桌面快捷方式 |

---

## 项目结构

```
keepass-electron/
├── .github/
│   ├── workflows/
│   │   ├── release.yml      # CI：构建 + Attestation + 发布 Release
│   │   └── codeql.yml       # CI：CodeQL 代码安全扫描
│   └── dependabot.yml       # 依赖自动更新配置
├── backend/
│   ├── core.py              # Google Sheets 读取、KDBX 生成、TOTP 处理
│   ├── backend_server.py    # JSON Lines 进程入口
│   ├── requirements.txt     # Python 依赖
│   └── keepass_backend.spec # PyInstaller 打包配置
├── electron/
│   ├── main.cjs             # Electron 主进程
│   └── preload.cjs          # 安全 IPC 白名单
├── src/
│   ├── App.jsx              # 主应用组件（连接/预览/导出三页）
│   ├── styles.css           # 全局样式与四套主题
│   ├── main.jsx             # React 入口
│   └── components/          # 通用组件（Icon、Modal、SplitPane 等）
├── build/
│   ├── icon.ico             # 应用图标（Windows）
│   └── icon.png             # 品牌图标（界面用）
├── docs/
│   └── ARCHITECTURE.md      # 架构说明
├── package.json             # 项目配置、electron-builder 配置
└── vite.config.js           # Vite 构建配置
```

---

## 常见问题

### Q: 连接时提示"权限不足"？

确认服务账号邮箱已被添加为 Google 表格的**编辑者**（不是"查看者"）。

### Q: 导出的 KeePass 文件没有主密码，安全吗？

生成的 `.kdbx` 文件默认无主密码，建议导入 KeePass 后立即设置主密码保护数据库。

### Q: TOTP 字段填什么格式？

两种格式均支持：
- Base32 密钥（不含空格）：`JBSWY3DPEHPK3PXP`
- 完整 URI：`otpauth://totp/账号名?secret=JBSWY3DPEHPK3PXP&issuer=服务名`

### Q: 中文、Emoji 等特殊字符是否支持？

支持。v8.4 修复了 `UnicodeEncodeError` 问题，合法 Unicode（中文、希腊文、俄文、Emoji 等）均可正常处理。

### Q: 能在 Linux / macOS 上使用吗？

当前仅支持 **Windows 10/11 x64**，暂无其他平台计划。

---

## 许可证

本项目基于 [GNU General Public License v3.0](LICENSE) 开源。

第三方组件许可证详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
