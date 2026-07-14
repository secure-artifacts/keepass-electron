# Architecture

## Renderer

React + Vite。负责主题、Flex 响应式布局、固定侧边栏、单一主滚动区、卡片、提示气泡、模态框、分页表格和列宽拖拽。

## Electron main/preload

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- 只通过 preload 暴露白名单 IPC

## Python backend

后台常驻 JSON Lines 进程：

- Google Sheets A:I 读取
- KDBX/TOTP 生成
- A 列命名
- I 列运行日志
- 进度事件

构建时 PyInstaller 把 Python 后端打包成 `keepass_backend.exe`，electron-builder 再把它作为 extraResource 放入 Electron 包。
