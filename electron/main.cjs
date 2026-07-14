const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const APP_ID = 'com.keepassstudio.desktop';

function repairUnicodeString(value) {
  const input = String(value ?? '');
  let output = '';
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = input.charCodeAt(index + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        output += input[index] + input[index + 1];
        index += 1;
      } else {
        output += '\uFFFD';
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      output += '\uFFFD';
    } else {
      output += input[index];
    }
  }
  return output;
}

function sanitizeForTransport(value) {
  if (typeof value === 'string') return repairUnicodeString(value);
  if (Array.isArray(value)) return value.map(sanitizeForTransport);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [repairUnicodeString(key), sanitizeForTransport(item)])
    );
  }
  return value;
}

function devRoot() {
  return path.join(__dirname, '..');
}

function packagedResource(...parts) {
  return path.join(process.resourcesPath, ...parts);
}

function resolveWindowIcon() {
  const candidates = app.isPackaged
    ? [packagedResource('icon.ico'), packagedResource('icon.png')]
    : [path.join(devRoot(), 'build', 'icon.ico'), path.join(devRoot(), 'build', 'icon.png')];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function resolveBackend() {
  if (app.isPackaged) {
    const exe = packagedResource('backend', 'keepass_backend.exe');
    if (!fs.existsSync(exe)) {
      throw new Error(`缺少 Python 后端文件：${exe}`);
    }
    return { command: exe, args: [], cwd: path.dirname(exe) };
  }

  const candidates = [
    process.env.KEEPASS_PYTHON,
    path.join(devRoot(), '.venv_backend', 'Scripts', 'python.exe'),
    path.join(devRoot(), '.venv_backend', 'bin', 'python'),
    process.platform === 'win32' ? 'python' : 'python3'
  ].filter(Boolean);

  const command = candidates.find((candidate) => candidate.includes(path.sep) ? fs.existsSync(candidate) : true);
  if (!command) throw new Error('找不到 Python 运行环境，请先运行开发环境初始化脚本。');
  return {
    command,
    args: [path.join(devRoot(), 'backend', 'backend_server.py')],
    cwd: devRoot()
  };
}

class BackendClient {
  constructor() {
    this.proc = null;
    this.pending = new Map();
    this.starting = null;
  }

  async ensureStarted() {
    if (this.proc && !this.proc.killed) return;
    if (this.starting) return this.starting;

    this.starting = new Promise((resolve, reject) => {
      let target;
      try {
        target = resolveBackend();
      } catch (error) {
        reject(error);
        return;
      }

      const proc = spawn(target.command, target.args, {
        cwd: target.cwd,
        windowsHide: true,
        shell: false,
        detached: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
      });

      this.proc = proc;
      let settled = false;
      const finishStart = (error) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };

      const stdout = readline.createInterface({ input: proc.stdout });
      stdout.on('line', (line) => this.handleLine(line));
      proc.stderr.on('data', (chunk) => console.error('[backend]', chunk.toString()));

      proc.once('error', (error) => {
        this.proc = null;
        this.rejectAll(error);
        finishStart(error);
      });

      proc.once('exit', (code) => {
        const error = new Error(`Python 后端已退出（代码 ${code ?? '未知'}）`);
        this.proc = null;
        this.rejectAll(error);
        finishStart(error);
      });

      // 后端为轻量 stdin/stdout 服务，正常启动后很快即可接受请求。
      setTimeout(() => finishStart(), 180);
    }).finally(() => {
      this.starting = null;
    });

    return this.starting;
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      console.warn('[backend non-json]', line);
      return;
    }

    if (message.type === 'progress') {
      BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('backend:progress', message));
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.type === 'error') pending.reject(new Error(message.error || '后端操作失败'));
    else pending.resolve(message.result);
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  async call(command, payload = {}) {
    await this.ensureStarted();
    if (!this.proc?.stdin?.writable) throw new Error('Python 后端不可用');

    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.setDefaultEncoding('utf8');
      const safeRequest = sanitizeForTransport({ id, command, payload });
      this.proc.stdin.write(`${JSON.stringify(safeRequest)}\n`, 'utf8', (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  close() {
    if (this.proc && !this.proc.killed) this.proc.kill();
    this.proc = null;
  }
}

const backend = new BackendClient();
let mainWindow;

function createWindow() {
  const iconPath = resolveWindowIcon();

  mainWindow = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#f4f7fb',
    icon: iconPath,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_ID);
    createWindow();

    try {
      await backend.call('ping', {});
    } catch (error) {
      dialog.showErrorBox(
        'KeePass Studio 启动失败',
        `界面已启动，但 Python 后端无法运行。\n\n${error.message}\n\n请重新运行完整打包脚本，不要单独打开 backend-dist 里的 keepass_backend.exe。`
      );
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => backend.close());

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:default-output', () => path.join(app.getPath('documents'), 'KeePass导出'));
ipcMain.handle('clipboard:write', (_event, text) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});
ipcMain.handle('dialog:service-json', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Google 服务账号 JSON',
    properties: ['openFile'],
    filters: [{ name: 'JSON 文件', extensions: ['json'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('dialog:output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 KeePass 输出目录',
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('shell:open-path', async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== 'string') return false;
  const error = await shell.openPath(path.resolve(targetPath));
  if (error) throw new Error(error);
  return true;
});
ipcMain.handle('backend:service-email', (_event, payload) => backend.call('service_email', payload));
ipcMain.handle('backend:fetch-sheet', (_event, payload) => backend.call('fetch', payload));
ipcMain.handle('backend:generate', (_event, payload) => backend.call('generate', payload));
